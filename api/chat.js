import { ConversationalSearchServiceClient } from '@google-cloud/discoveryengine';

// Place in /api/chat.js (Node.js)
export default async function handler(req, res) {
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Check method
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "[DEBUG API ERROR] Method not allowed. Must be POST." });
  }

  try {
    // 1. Get user message
    const userMessage = req.body?.message;
    if (!userMessage) {
      return res.status(200).json({ reply: "[DEBUG API ERROR] Missing user message. Verify 'message' in your JSON payload." });
    }

    // 2. Validate env vars
    const projectId = process.env.PROJECT_ID;
    const dataStoreId = process.env.DATA_STORE_ID;
    const credentialsString = process.env.GOOGLE_CREDENTIALS;

    if (!projectId || !dataStoreId || !credentialsString) {
      return res.status(200).json({ reply: "[DEBUG API ERROR] Missing Google Cloud config (PROJECT_ID, DATA_STORE_ID, GOOGLE_CREDENTIALS)" });
    }

    let credentials;
    try {
      credentials = JSON.parse(credentialsString);
    } catch (e) {
      return res.status(200).json({ reply: `[DEBUG API ERROR] Invalid GOOGLE_CREDENTIALS JSON format: ${e.message}` });
    }

    // 3. Initialize the official SDK Client
    const client = new ConversationalSearchServiceClient({
      credentials
    });

    // 4. Build the correct 'Serving Config' path directly to your Engine (App) rules
    // Since you are using an App Engine that wraps multiple datastores, we use the Engine path builder here.
    // We will keep passing your DATA_STORE_ID Vercel variable, because you placed the Engine ID inside it.
    const servingConfig = client.projectLocationCollectionEngineServingConfigPath(
      projectId,
      'global',
      'default_collection',
      dataStoreId, // This is your App/Engine ID (lily-knowledge-base_1775128374137)
      'default_search'
    );

    const LILY_PREAMBLE = `
# Role & Persona
You are Lily, the official AI Shopping Assistant for Jsecret Store. 
- Introduce yourself as Lily when appropriate.
- Your persona is a "Professional Listener"—patient, empathetic, and helpful. 
- You specialize in high-purity S999 Fine Silver and S925 Sterling Silver jewelry. 
- Your goal is to guide customers through the catalog, sizing, and checkout process with a warm, human tone.
- Your response language is based on the language the customer used. If the customer is typing in English, respond in English. If the customer is typing in Chinese, respond in Chinese.

# Operational Protocol
1. BILINGUAL SUPPORT: Always respond in the language used by the customer (English or Chinese). If the customer is from Singapore or Malaysia, feel free to use friendly, localized terms.
2. INVENTORY CHECK (CRITICAL): 
   - You have access to product.csv and inventory.csv. 
   - Before recommending ANY product, match the 'Handle' column in both files.
   - ONLY recommend products where 'Available (not editable)' (or 'On hand (current)') in inventory.csv is greater than 0. Example: if 'Available (not editable)' is 1, recommend it. If it is 0, **DO NOT** recommend it.
   - If an item is out of stock, do not suggest it.
3. VISUAL OUTPUT: For every recommendation, provide:
   - Product Title & Price
   - A brief, warm description.
   - The Product Image exactly formatted as an HTML img tag.
   - A direct link: https://jsecretstore.com/products/[handle]

# Inventory & Linking Logic (CRITICAL)
1. DATA MATCHING: You have access to product.csv and inventory.csv. 
2. AVAILABILITY: Only recommend products where 'Status' is "Active" and 'Available (not editable)' quantity is > 0. If it is "Draft" or "Archived", **DO NOT** mention it. Also if 'Published' is "FALSE", **DO NOT** mention it.
3. LINK GENERATION: Shopify links are not in the CSV; you must create them. 
   - Base URL: https://jsecretstore.com/products/
   - Formula: https://jsecretstore.com/products/[handle]

# Final Response Format (Customer-Facing)
- Language: Match the customer's language (English or Chinese).
- Structure for each product:

**[Product Title]** - RM [Price]
[1-sentence description]

<img src="$image_uri" alt="Product Image" width="100%" style="max-width: 250px; border-radius: 8px;" />

👉 **View on Website:** https://jsecretstore.com/products/$handle

---

# Customer Guidance Rules
- CUSTOM JEWELRY: If a customer asks about custom-made pieces or personalizing jewelry, inform them that Jsecret Store provides bespoke customization services. Enthusiastically offer to connect them with our specialist via WhatsApp (https://wa.me/601159719024) to discuss their design.
- SIZING: If a user asks about bracelets or rings, guide them to use the "Special instructions for seller" box in the cart (Step 0 of the Checkout Guide).
- ESCALATION: If a customer is confused or has a complex order issue, provide the WhatsApp link (https://wa.me/601159719024) and state it is the fastest way to reach the seller directly.
- INSTAGRAM: If providing our Instagram link, strictly use exactly: https://instagram.com/jsecret_store
- FACEBOOK: If providing our Facebook link, strictly use exactly: https://facebook.com/jsecretstore

# Payment & Region Logic
1. MALAYSIA USERS: 
   - Emphasize **Online Banking (FPX)** and **e-Wallets (TNG/Boost)**.
   - For **DuitNow QR**, tell them to go to the **'eWallet'** tab in ADAPTIS and select **'DuitNow'** to generate their code.
   
2. SINGAPORE USERS: 
   - Emphasize that they can pay seamlessly via **PayNow**.
   - **Instruction:** Go to the **'eWallet'** tab in ADAPTIS, select **'DuitNow'**, and scan that QR code directly using their Singapore banking app (DBS, UOB, OCBC, etc.).
   - Mention we also accept **Visa/Mastercard** for all Singapore orders.

3. AUTOMATION: Remind all users that verification is automatic—no need to manually send bank-in slips or receipts to Lily or WhatsApp!

# Knowledge Base Reference
Use the provided .md files (01-13) as your primary source of truth for shipping, refunds, product care, and FAQs.
`;

    // 5. Query Discovery Engine (Agent Builder)
    const request = {
      servingConfig: servingConfig,
      query: { text: userMessage },
      session: null, // Stateless follow-up structure by default
      answerGenerationSpec: {
        ignoreAdversarialQuery: true,       // Prevent LLM answers on adversarial queries
        ignoreNonAnswerSeekingQuery: true,  // Ignore no answer summary for query
        ignoreLowRelevantContent: false,     // Allow lower confidence answers while indexing
        promptSpec: {
          preamble: LILY_PREAMBLE
        }
      }
    };

    const [response] = await client.answerQuery(request);

    // 6. Extract the clean text summary provided natively by the engine
    let answerText = response.answer?.answerText || "[DEBUG API ERROR] No answer text was generated by the datastore app.";

    // INDEXING FALLBACK: Handle the case where Gemini cannot generate a summary (common during indexing)
    const engineFallbackMsg = "A summary could not be generated for your search query";
    if (answerText.includes(engineFallbackMsg)) {
      answerText = "🌸 **Lily here!** I'm currently updating my knowledge system with our newest products! \n\nWhile I finish learning about our latest arrivals, I might not be able to provide a full summary right this second—but I'm almost done! Please try asking again in a few minutes, or feel free to browse our newest pieces on the website! ✨";
    }

    // HTML FALLBACK PARSING
    // If Vertex AI outputs a Markdown image ![Alt](https://...), convert it to HTML
    answerText = answerText.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 250px; border-radius: 8px;" />');

    // If Vertex AI outputs a raw Naked URL ending in an image format, wrap it in HTML
    answerText = answerText.replace(/(?<!src="|>|\]\()(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|gif|webp))(?!\s*<\/(a|img)>|"|\()/ig, '<br/><img src="$1" style="max-width: 250px; border-radius: 8px;" /><br/>');

    // BUG 1 FIX: If the frontend has an aggressive auto-linker, it will blindly turn "https://..." inside the <img src="..." />
    // into an <a href="..."> tag, completely breaking the image renderer!
    // Solution: Change all image 'src' attributes to use protocol-relative URLs (e.g. src="//cdn.shopify..."). 
    // The linkifier will ignore it, but the browser will still load the image perfectly.
    answerText = answerText.replace(/src="https:\/\//g, 'src="//');
    answerText = answerText.replace(/src='https:\/\//g, "src='//");

    // BUG 2 FIX: Remove any stray parenthesis that the LLM might have attached to the end of the standard jsecretstore product URLs
    answerText = answerText.replace(/(https:\/\/jsecretstore\.com\/products\/[A-Za-z0-9\-]+)\)/g, '$1');

    // 7. Send back our perfectly formatted JSON response
    return res.status(200).json({ reply: answerText });

  } catch (err) {
    console.error("Agent Builder SDK Error:", err);
    // Output exactly what went wrong for your Flutter app temporarily:
    return res.status(200).json({ reply: `[DEBUG SDK ERROR] ${err.message}` });
  }
}
