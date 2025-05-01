// Place in /api/chat.js (Node.js)
export default async function handler(req, res) {
    const userMessage = req.body.message;
    const apiKey = process.env.OPENAI_API_KEY;
  
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "ft:gpt-4o-mini-2024-07-18:personal::BS59jwr8",
        messages: [
          { role: "system", content: "You are a friendly e-commerce assistant named Lily who helps customers find fashion and jewelry products." },
          { role: "user", content: userMessage },
        ],
      }),
    });
  
    const data = await response.json();
    res.status(200).json({ reply: data.choices[0].message.content });
  }  