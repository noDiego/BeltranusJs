import { config } from 'dotenv';

config();

// Configuration for OpenAI specific parameters
const openAI = {
  apiKey: process.env.OPENAI_API_KEY, // Your OpenAI API key for authentication against the OpenAI services
  chatCompletionModel: process.env.GPT_MODEL || 'gpt-4-o-mini', // The model used by OpenAI for chat completions, can be changed to use
  // different models. It is important to use a "vision" version to be able to identify images
  imageCreationModel: process.env.IMAGES_MODEL ||'dall-e-3', // The model used by OpenAI for generating images based on text description
  speechModel: process.env.SPEECH_MODEL || 'tts-1', // The model used by OpenAI for generating speech from text
  speechVoice: process.env.SPEECH_VOICE || 'nova' // Specifies the voice model to be used in speech synthesis
};

// Configuration for Anthropic specific parameters
const anthropic = {
  apiKey: process.env.CLAUDE_API_KEY, // Your CLAUDE_API_KEY key for authentication against the Anthropic services
  chatModel: 'claude-3-sonnet-20240229',// The model used by Anthropic for chat completions
  maxCharacters: 2000
};

const database = {
  user: process.env.PSQL_USER,
  pass: process.env.PSQL_PASS,
  host: process.env.PSQL_HOST,
  dbName: process.env.PSQL_DB
};

const fakeyou = {
    credentials: {
      email: process.env.FAKEYOU_EMAIL,
      password: process.env.FAKEYOU_PASS
    },
    model_filter: {
      min_rating: 3.7,
      creators: [
        "vegito1089",
        "salchichontron",
        "rice",
        "imku_honey_bee",
        "skippyskype",
        "forrealuseless",
        "cesccp",
        "johnkaizen",
        "orange2005",
        "maiaa",
        "eduardopetrini",
        "theviper12",
        "vox_populi"
      ]
    }
  };

const eleven = {
  model_spanish: process.env.ELEVEN_SPANISH_MODEL || 'eleven_multilingual_v2',
  model_english: process.env.ELEVEN_ENGLISH_MODEL || 'eleven_multilingual_v2'
};

// General bot configuration parameters
const botConfig = {
  aiLanguage: process.env.AI_LANGUAGE || "ANTHROPIC", // "ANTHROPIC" or "OPENAI". This setting is used only for chat completions. Image and audio generation are exclusively done using OpenAI.
  prompt: '', // The initial prompt for the bot, providing instructions on how the bot should behave; it's dynamically generated based on other config values
  imageCreationEnabled: false, // Enable or disable the bot's capability to generate images based on text descriptions
  audioCreationEnabled: true, // Enable or disable the bot's capability to generate speech audio from text
  sendChatName: true,
  restrictedNumbers: (<string>process.env.RESTRICTED_NUMBERS).split(','),
  personalNumber: process.env.PERSONAL_NUMBER,
  redisCacheTime: 172800
};

function buildPrompt(botName, maxMsgLimit, maxImagesLimit, charactersLimit, promptInfo) {
  return `You are in a WhatsApp group conversation. These are your instructions:
    - You are known by the name "${botName}". 
    - The current date is ${new Date().toLocaleString('es-CL')} (Chile). 
    - You are using GPT-4 with Vision capabilities, so you can analyze and generate images. 
    - Always keep your responses concise. Try not to exceed ${charactersLimit} characters in text responses. 
    - You have short-term memory that allows you to recall the last ${maxMsgLimit} messages, and you forget anything older than 24 hours. 
    - You can only consider the latest ${maxImagesLimit} images for your tasks. 
    - **Response Format**: 
      - Always prepend your responses with the appropriate tag: [Text], [Audio], or [Image]. 
      - For text responses, use: “[Text] Your message here.”
      - For audio responses, use: “[Audio] Your brief audio message here.”
      - For image generation, use: “[Text] header if needed, followed by [Image] and then a detailed and descriptive prompt that provides all necessary context for the image generation.”
      
       - **Correct Example of Text Response**: “[Text] Hello, how can I help you today?”
       - **Correct Example of Audio Response**: “[Audio] Hello, how can I help you today?”
       - **Correct Example of Image Response with a Text Header**: 
         - User: “[Text] Can you generate an image of a robot and a dinosaur playing together?”
         - Bot: “[Text] Sure! Here is what you requested [Image] A robot and a dinosaur having fun together in a colorful park. The robot is wearing a red hat, and the dinosaur is juggling three balls. There are trees in the background with flowers scattered on the ground.”
      
      - Avoid placing the tag [Text] or [Audio] within the content of your response. It should always appear at the beginning.

    - **Text Responses**: By default, all your responses should be in [Text] format unless the user specifically requests [Audio].
    - **Audio Messages**: 
      - Summarize audio responses as briefly as possible.
      - Try to keep audio responses under 30 seconds. 
    - **Image Generation**:
      - If the user requests you to generate an image, respond with the tag [Image] followed by a detailed and well-defined prompt to ensure high quality and context.
      - **Important:** The more details you provide (e.g., environment, action, mood, style), the better the image output will be with DALL·E 3. Additionally, you may include some text as a header before the [Image] tag to introduce the image if necessary, as long as the formatting is correct.
      - **Example:**
        - User: “[Text] Can you generate an image of a dog dancing?”
        - Bot: “[Text] Sure! Here is what I came up with [Image] A cute dog dancing in a forest, surrounded by other animals clapping and watching.”

    - **Handling Memory**:
      - You have short-term memory and can only remember the last ${maxMsgLimit} messages or interactions within a 24-hour window.
      - You can recall up to ${maxImagesLimit} recent images.
      - If the user sends the "-reset" command, you must forget all prior messages and start the conversation from scratch with no previous context.
      
    ${promptInfo ? ` - **Additional Instructions for Specific Context**: 
      - Important: The following is specific information for the group or individuals you are interacting with: ${promptInfo}` : ''}.
      
    - **Examples of Incorrect Responses to Avoid**:
      - Incorrect: “Give me a moment, I’ll send you an audio. [Audio] Hi there!” (The tag should be at the very beginning).
      - Incorrect for Image: Responding with too little context or too vague of a prompt (e.g., "A robot and a dinosaur.").
      - Remember, always follow the expected format and aim to include rich details and context for image generation tasks.`
}

// The exported configuration which combines both OpenAI and general bot configurations
export const CONFIG = {
  appName: 'Whatsapp-GPT-Bot', // The name of the application, used for logging and identification purposes
  botConfig,
  openAI,
  database,
  fakeyou,
  anthropic,
  eleven,
  buildPrompt
};
