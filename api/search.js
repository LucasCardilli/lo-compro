export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { product } = req.body;
  if (!product || typeof product !== 'string' || product.trim().length === 0) {
    return res.status(400).json({ error: 'Missing product' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `Eres un asistente experto en precios de productos en Argentina.
Tu tarea es buscar el precio actual de un producto en Buenos Aires, Argentina.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin backticks, sin markdown.
El JSON debe tener esta estructura exacta:
{
  "found": true o false,
  "priceARS": número (precio en pesos argentinos, sin separadores, solo número),
  "source": "nombre de la tienda o fuente",
  "usdOfficial": número (tipo de cambio USD/ARS oficial aproximado actual),
  "notes": "observación breve sobre el precio"
}
Si no encontrás el precio, pon found: false y el resto en null.
No incluyas NADA más que el JSON.`,
        messages: [{
          role: 'user',
          content: `Busca el precio actual de "${product.trim()}" en Buenos Aires, Argentina.
Buscá en MercadoLibre Argentina, Frávega, Garbarino, Musimundo o tiendas especializadas.
Necesito el precio en pesos argentinos (ARS) más representativo y el tipo de cambio oficial USD/ARS actual.`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'Upstream error', detail: err });
    }

    const data = await response.json();

    // Extract text blocks
    const fullText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // Parse JSON from response
    const clean = fullText.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'No JSON in response' });

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
