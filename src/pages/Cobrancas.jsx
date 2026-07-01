async function chamarEdgeFunction(action, payload) {
  const resp = await fetch(`/api/inter-cobranca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}