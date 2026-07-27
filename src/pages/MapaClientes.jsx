import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import icon2x from 'leaflet/dist/images/marker-icon-2x.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
import { supabase } from '../lib/supabase'
import {
  UFS_IBGE, SIGLA_PARA_CODIGO_UF, CENTRO_BRASIL,
  buscarMalhaBrasil, buscarMalhaMunicipios, buscarNomeMunicipio, geocodificarEndereco,
} from '../lib/geoBrasil'
import { Loader2, ArrowLeft, MapPin, Users } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

// Correção padrão do ícone default do Leaflet — sem isso o pino some,
// porque o bundler não resolve os caminhos relativos que o Leaflet usa
// internamente para achar as imagens.
L.Marker.prototype.options.icon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: icon2x,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Escala de cor (azul claro -> azul escuro da marca) proporcional à
// quantidade de clientes em relação ao maior valor do nível atual. Usa
// um piso mínimo de 40% pra qualquer lugar com pelo menos 1 cliente —
// sem isso, num estado como a Bahia (Feira de Santana com 72 vs.
// cidades vizinhas com 1-2), a diferença ficava praticamente invisível
// e dava a impressão de que o clique não reagia a nada.
function corPorQuantidade(qtd, max) {
  if (!qtd) return '#f3f4f6'
  const t = Math.max(0.4, max > 0 ? qtd / max : 0)
  const de = [219, 234, 254] // brand-100
  const para = [26, 86, 219] // brand-600
  const rgb = de.map((c, i) => Math.round(c + (para[i] - c) * t))
  return `rgb(${rgb.join(',')})`
}

export default function MapaClientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [malhaBrasil, setMalhaBrasil] = useState(null)
  const [malhaMunicipios, setMalhaMunicipios] = useState(null)
  const [ufSelecionada, setUfSelecionada] = useState(null) // sigla
  const [municipioSelecionado, setMunicipioSelecionado] = useState(null) // codigo ibge
  const [nomeMunicipio, setNomeMunicipio] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [geocodificando, setGeocodificando] = useState(null) // id do cliente em andamento
  const mapRef = useRef(null)

  useEffect(() => {
    carregarClientes()
    buscarMalhaBrasil().then(setMalhaBrasil).catch((err) => alert(err.message))
  }, [])


  async function carregarClientes() {
    setLoading(true)
    const { data } = await supabase
      .from('clientes')
      .select('id, nome, regime, cnpj, uf, codigo_municipio_ibge, logradouro, numero_endereco, bairro, cep, latitude, longitude')
      .not('uf', 'is', null)
      .not('codigo_municipio_ibge', 'is', null)
    setClientes(data || [])
    setLoading(false)
  }

  const clientesPorUf = useMemo(() => {
    const contagem = {}
    for (const c of clientes) contagem[c.uf] = (contagem[c.uf] || 0) + 1
    return contagem
  }, [clientes])

  const maxPorUf = useMemo(() => Math.max(0, ...Object.values(clientesPorUf)), [clientesPorUf])

  const clientesPorMunicipio = useMemo(() => {
    if (!ufSelecionada) return {}
    const contagem = {}
    for (const c of clientes) {
      if (c.uf !== ufSelecionada) continue
      contagem[c.codigo_municipio_ibge] = (contagem[c.codigo_municipio_ibge] || 0) + 1
    }
    return contagem
  }, [clientes, ufSelecionada])

  const maxPorMunicipio = useMemo(() => Math.max(0, ...Object.values(clientesPorMunicipio)), [clientesPorMunicipio])

  const clientesDoMunicipio = useMemo(() => {
    if (!municipioSelecionado) return []
    return clientes.filter((c) => c.codigo_municipio_ibge === municipioSelecionado)
  }, [clientes, municipioSelecionado])

  async function selecionarUf(sigla, bounds) {
    const qtd = clientesPorUf[sigla] || 0
    if (!qtd) return
    setUfSelecionada(sigla)
    setMunicipioSelecionado(null)
    setClienteSelecionado(null)
    setMalhaMunicipios(null)
    if (bounds && mapRef.current) mapRef.current.fitBounds(bounds)
    try {
      const codigoUf = SIGLA_PARA_CODIGO_UF[sigla]
      const malha = await buscarMalhaMunicipios(codigoUf)
      setMalhaMunicipios(malha)
    } catch (err) {
      alert(err.message)
    }
  }

  async function selecionarMunicipio(codigo, bounds) {
    const qtd = clientesPorMunicipio[codigo] || 0
    if (!qtd) return
    setMunicipioSelecionado(codigo)
    setClienteSelecionado(null)
    if (bounds && mapRef.current) mapRef.current.fitBounds(bounds)
    setNomeMunicipio(await buscarNomeMunicipio(codigo))
  }

  function voltarParaBrasil() {
    setUfSelecionada(null)
    setMalhaMunicipios(null)
    setMunicipioSelecionado(null)
    setClienteSelecionado(null)
    if (mapRef.current) mapRef.current.setView(CENTRO_BRASIL, 4)
  }

  function voltarParaEstado() {
    setMunicipioSelecionado(null)
    setClienteSelecionado(null)
  }

  async function verNoMapa(cliente) {
    if (cliente.latitude && cliente.longitude) {
      setClienteSelecionado(cliente)
      mapRef.current?.setView([cliente.latitude, cliente.longitude], 16)
      return
    }
    setGeocodificando(cliente.id)
    try {
      const resultado = await geocodificarEndereco(cliente)
      if (!resultado) {
        alert(`Não foi possível localizar o endereço de ${cliente.nome} no mapa (endereço incompleto ou não encontrado).`)
        return
      }
      await supabase.from('clientes').update(resultado).eq('id', cliente.id)
      const clienteAtualizado = { ...cliente, ...resultado }
      setClientes((prev) => prev.map((c) => (c.id === cliente.id ? clienteAtualizado : c)))
      setClienteSelecionado(clienteAtualizado)
      mapRef.current?.setView([resultado.latitude, resultado.longitude], 16)
    } catch (err) {
      alert(`Erro ao localizar: ${err.message}`)
    } finally {
      setGeocodificando(null)
    }
  }

  function estiloBrasil(feature) {
    const uf = UFS_IBGE[feature.properties.codarea]
    const qtd = uf ? clientesPorUf[uf.sigla] || 0 : 0
    return {
      fillColor: corPorQuantidade(qtd, maxPorUf),
      fillOpacity: 0.85,
      color: '#ffffff',
      weight: 1,
    }
  }

  function estiloMunicipios(feature) {
    const codigo = feature.properties.codarea
    const qtd = clientesPorMunicipio[codigo] || 0
    const selecionado = codigo === municipioSelecionado
    return {
      fillColor: corPorQuantidade(qtd, maxPorMunicipio),
      fillOpacity: 0.85,
      color: selecionado ? '#1e3a8a' : '#ffffff',
      weight: selecionado ? 3 : 1,
    }
  }

  function aoCadaFeatureBrasil(feature, layer) {
    const uf = UFS_IBGE[feature.properties.codarea]
    if (!uf) return
    const qtd = clientesPorUf[uf.sigla] || 0
    layer.bindTooltip(`${uf.nome}: ${qtd} cliente${qtd === 1 ? '' : 's'}`)
    if (qtd > 0) {
      layer.on('click', () => {
        try {
          selecionarUf(uf.sigla, layer.getBounds())
        } catch (err) {
          alert(`Erro ao clicar em ${uf.nome}: ${err.message}`)
        }
      })
      layer.on('mouseover', () => layer.setStyle({ weight: 2 }))
      layer.on('mouseout', () => layer.setStyle({ weight: 1 }))
    }
  }

  function aoCadaFeatureMunicipios(feature, layer) {
    const codigo = feature.properties.codarea
    const qtd = clientesPorMunicipio[codigo] || 0
    if (qtd > 0) {
      layer.on('click', () => {
        try {
          selecionarMunicipio(codigo, layer.getBounds())
        } catch (err) {
          alert(`Erro ao clicar no município: ${err.message}`)
        }
      })
      layer.on('mouseover', () => layer.setStyle({ weight: 2 }))
      layer.on('mouseout', () => layer.setStyle({ weight: municipioSelecionado === codigo ? 3 : 1 }))
    }
  }

  if (loading || !malhaBrasil) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">🗺️ Mapa de Clientes</h1>
        <p className="text-sm text-gray-500 mt-1">
          {!ufSelecionada && 'Clique num estado para ver os municípios.'}
          {ufSelecionada && !municipioSelecionado && 'Clique num município para ver os clientes.'}
          {municipioSelecionado && `Clientes em ${nomeMunicipio}.`}
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {ufSelecionada && (
          <button onClick={voltarParaBrasil} className="btn-secondary btn-sm gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Brasil
          </button>
        )}
        {municipioSelecionado && (
          <button onClick={voltarParaEstado} className="btn-secondary btn-sm gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> {UFS_IBGE[SIGLA_PARA_CODIGO_UF[ufSelecionada]]?.nome || ufSelecionada}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card overflow-hidden" style={{ height: '65vh' }}>
          <MapContainer
            ref={mapRef}
            center={CENTRO_BRASIL}
            zoom={4}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {!malhaMunicipios && (
              <GeoJSON key="brasil" data={malhaBrasil} style={estiloBrasil} onEachFeature={aoCadaFeatureBrasil} />
            )}
            {malhaMunicipios && (
              <GeoJSON key={`municipios-${ufSelecionada}`} data={malhaMunicipios} style={estiloMunicipios} onEachFeature={aoCadaFeatureMunicipios} />
            )}
            {clienteSelecionado?.latitude && clienteSelecionado?.longitude && (
              <Marker position={[clienteSelecionado.latitude, clienteSelecionado.longitude]}>
                <Popup>
                  <strong>{clienteSelecionado.nome}</strong><br />
                  {[clienteSelecionado.logradouro, clienteSelecionado.numero_endereco].filter(Boolean).join(', ')}<br />
                  {clienteSelecionado.bairro}
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        <div className="card p-4 overflow-y-auto" style={{ height: '65vh' }}>
          {!municipioSelecionado && (
            <div className="text-sm text-gray-500 flex flex-col items-center justify-center h-full text-center gap-2">
              <Users className="w-8 h-8 text-gray-300" />
              {ufSelecionada
                ? 'Clique num município colorido no mapa para ver os clientes.'
                : 'Clique num estado colorido no mapa para começar.'}
            </div>
          )}
          {municipioSelecionado && (
            <div className="space-y-2">
              <h2 className="font-semibold text-gray-800 mb-2">{nomeMunicipio} ({clientesDoMunicipio.length})</h2>
              {clientesDoMunicipio.map((c) => (
                <div key={c.id} className="border border-gray-100 rounded-lg p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 text-sm truncate">{c.nome}</div>
                    <div className="text-xs text-gray-500">{c.regime || '—'}</div>
                  </div>
                  <button
                    onClick={() => verNoMapa(c)}
                    disabled={geocodificando === c.id}
                    className="btn-secondary btn-sm gap-1.5 flex-shrink-0"
                  >
                    {geocodificando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                    Ver no mapa
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
