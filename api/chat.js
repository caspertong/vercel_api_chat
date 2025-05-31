// Place in /api/chat.js (Node.js)
export default async function handler(req, res) {
    // Allow CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.status(200).end(); // Handle preflight
        return;
    }
    
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }
    
    const userMessage = req.body?.message;
    if (!userMessage) {
        return res.status(400).json({ error: "Missing message" });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "Missing OpenAI API key" });
    }

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "ft:gpt-4o-mini-2024-07-18:personal::BdJ0o9gb",
            messages: [
              {
                role: "system",
                content: "You are a friendly e-commerce assistant named Lily who helps customers find fashion and jewelry products.",
              },
              { role: "user", content: userMessage },
            ],
          }),
        });
    
        const data = await response.json();
    
        if (!response.ok) {
          return res.status(response.status).json({ error: data });
        }
    
        res.status(200).json({ reply: data.choices[0].message.content });
      } catch (err) {
        res.status(500).json({ error: err.message || "Internal server error" });
    }
}