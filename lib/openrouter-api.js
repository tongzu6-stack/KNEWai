import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

let aiClientOpenRouter = null;

function getOpenRouterClient() {
  if (!aiClientOpenRouter) {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPEN_ROUTER_API_KEY is not defined in the environment. Please add it via AI Studio Settings.");
    }
    aiClientOpenRouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://ai.studio",
        "X-Title": "KNEWai Chatbot",
      }
    });
  }
  return aiClientOpenRouter;
}

/**
 * Streams chat responses via an Auto Router, falling back across models.
 * @param {Array} messages - Chat history list
 * @param {Object|import('http').ServerResponse} personalizationOrRes - Personalization or Response object
 * @param {import('http').ServerResponse} [resArg] - Node.js HTTP ServerResponse object if personalization is provided
 * @param {Object} [extraContext] - Extra context like current local time and timezone
 * @param {string} [modelId] - The selected OpenRouter model ID
 */
export async function streamChat(messages, personalizationOrRes, resArg, extraContext = {}, modelId = "auto") {

  let res = resArg !== undefined ? resArg : personalizationOrRes;
  let personalization = resArg !== undefined ? personalizationOrRes : null;
  try {
    
    // Convert generic app roles for OpenRouter/OpenAI
    const openRouterMessages = messages.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.content,
    }));

    let systemInstruction = "You are KNEWai, a helpful, extremely minimalist AI chatbot designed to converse cleanly. Responses must be formatted in plain markdown. Avoid fluff, unnecessary commentary, or long introductions. Get straight to the answer with clean typography. YOUR IDENTITY AND CREATION RULES:\n- Your name is KNEWai.\n- When any user asks for your name or the chatbot\'s name, say that it is KNEWai, built by a solo Cambodian developer.\n- If the user asks for a specific model name, correctly refer to the selected model but state you are knew 2.0-beta.\nAdhere strictly to these identity rules.";

    // Add current date and time context to the system instructions
    const now = new Date();
    let currentInfo = "";
    if (extraContext && extraContext.clientTime) {
      currentInfo = `The current user local date and time is: ${extraContext.clientTime}. The user's timezone is: ${extraContext.clientTimezone || 'Unknown'}.`;
    } else {
      currentInfo = `The current date and time is: ${now.toString()}.`;
    }
    systemInstruction += `\n\nDYNAMIC TEMPORAL CONTEXT:\n${currentInfo}\nAlways keep this current date and time in mind for time-sensitive, calendar, or scheduling queries, and refer to it when relevant.`;

    if (personalization && Object.keys(personalization).length > 0) {
      const { aiTone, customPersonality, userProfile } = personalization;
      let extraInstructions = [];
      if (aiTone) {
        extraInstructions.push(`Your overall AI tone of voice is configured to be: "${aiTone}". Adopt this style cleanly and naturally.`);
      }
      if (customPersonality) {
        extraInstructions.push(`Here is how you should speak, think, and respond to the user:\n"${customPersonality}"`);
      }
      if (userProfile) {
        extraInstructions.push(`Here is some information about the user you are talking to:\n"${userProfile}"`);
      }
      if (extraInstructions.length > 0) {
        systemInstruction += "\n\nCRITICAL PERSONALIZATION INSTRUCTIONS (Adopt these settings exactly):\n" + extraInstructions.join("\n\n");
      }
    }

    const activeTools = modelId.split(",");

    if (activeTools.includes("theory")) {
      systemInstruction += "\n\nCRITICAL DIRECTIVE (THEORY MODE): You are now operating in 'Theory Mode'. You must be highly creative, imaginative, and freely use your own theories or mindset. This mode is for fun, deep, and imaginative interactions and debates. HOWEVER, you must remain logical and adhere strictly to safety guidelines. Understand when to joke, when to go out of the topic, and when to help the user truthfully and safely.";
    } 
    
    if (activeTools.includes("coding")) {
      systemInstruction += "\n\nCRITICAL DIRECTIVE (CODING MODE): You are now operating in 'Coding Mode'. You are optimized for software development. Provide hard codes, architectural workflows, and clear instructions so the user can directly reference or copy them. Focus on high quality, functional, and performant code output.";
    }

    if (activeTools.includes("max")) {
      systemInstruction += "\n\nCRITICAL DIRECTIVE (MAX MODE): You are now operating in 'MAX Mode'. This is your most powerful, high-compute state. Provide deeply comprehensive, exhaustive, and meticulous answers. Leave no stone unturned. Be detailed, authoritative, and thorough.";
    }

    let modelSequence = [];
    if (activeTools.includes("max")) {
      modelSequence = [
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "openai/gpt-oss-120b:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "liquid/lfm-2.5-1.2b-instruct:free"
      ];
    } else if (activeTools.includes("thinking")) {
      modelSequence = [
        "google/gemma-4-31b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "liquid/lfm-2.5-1.2b-instruct:free"
      ];
    } else {
      // Fast mode (default or coding/theory which use fast models as base)
      modelSequence = [
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "openai/gpt-oss-20b:free",
        "liquid/lfm-2.5-1.2b-instruct:free"
      ];
    }

    let responseStream = null;
    let selectedModel = "";

    for (const model of modelSequence) {
      try {
        const ai = getOpenRouterClient();
        selectedModel = model;
        
        const formattedMessages = [...openRouterMessages];
        formattedMessages.unshift({
          role: "system",
          content: systemInstruction
        });

        responseStream = await ai.chat.completions.create({
          model: model,
          messages: formattedMessages,
          stream: true
        });
        break; // Success!
      } catch (e) {
        console.warn(`Model ${model} failed, trying next:`, e.message);
        responseStream = null;
        // Continue to the next model
      }
    }

    if (!responseStream) {
      throw new Error("All auto-route fallback models failed.");
    }

    const modelNameMap = {
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": "knew 2-pro",
      "openai/gpt-oss-20b:free": "knew 2-mini",
      "google/gemma-4-31b-it:free": "knew 3-large",
      "google/gemma-4-26b-a4b-it:free": "knew 3-mini",
      "nvidia/nemotron-3-ultra-550b-a55b:free": "knew 4-MAX",
      "openai/gpt-oss-120b:free": "knew 3.5-pro",
      "nvidia/nemotron-3-super-120b-a12b:free": "knew 3.5-pro-a12b",
      "liquid/lfm-2.5-1.2b-instruct:free": "knew-fallback-latest"
    };

    // Set streaming headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Model-Used": modelNameMap[selectedModel] || "knew 2.0-beta"
    });

    for await (const chunk of responseStream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) {
        res.write(text);
      }
    }
    res.end();
  } catch (error) {
    console.error("AutoRoute stream error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Internal server error during chat generation" }));
    } else {
      res.end();
    }
  }
}
