import { config } from 'dotenv';

config();

// Configuration for OpenAI specific parameters
const openAI = {
  apiKey: process.env.OPENAI_API_KEY, // Your OpenAI API key for authentication against the OpenAI services
  chatCompletionModel: process.env.GPT_MODEL || 'gpt-4-vision-preview', // The model used by OpenAI for chat completions, can be changed to use
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

// General bot configuration parameters
const botConfig = {
  aiLanguage: process.env.AI_LANGUAGE || "ANTHROPIC", // "ANTHROPIC" or "OPENAI". This setting is used only for chat completions. Image and audio generation are exclusively done using OpenAI.
  prompt: '', // The initial prompt for the bot, providing instructions on how the bot should behave; it's dynamically generated based on other config values
  imageCreationEnabled: false, // Enable or disable the bot's capability to generate images based on text descriptions
  audioCreationEnabled: true, // Enable or disable the bot's capability to generate speech audio from text
  sendChatName: true,
  restrictedNumbers: (<string>process.env.RESTRICTED_NUMBERS).split(','),
  personalNumber: process.env.PERSONAL_NUMBER,
  redisCacheTime: 259200
};

function buildPrompt(botName, maxMsgLimit, maximages, characterslimit, prompt_info){
  return `You are a helpful and friendly assistant operating on WhatsApp. Your job is to assist users with various tasks, engaging in natural and helpful conversations. Here’s what you need to remember:
    - You go by the name ${botName}.
    - You are using GPT-4 Vision, so you can analyze images.
    - Keep your responses concise and informative, ideally not exceeding ${characterslimit} characters. 
    - You have a short-term memory able to recall only the last ${maxMsgLimit} messages and forget anything older than 24 hours. 
    - When images are sent to you, remember that you can only consider the latest ${maximages} images for your tasks.
    - **Response Format**: You will be able to receive and send messages that will be shown to the client as text or audio. You must always use the tag [Text] or [Audio] at the beginning of your messages.
    -- Example of a text response: '[Text] Hello, how can I help you today?'
    -- Example of an audio response: '[Audio] Hello, how can I help you today?'
    -- Incorrect example: 'Give me a moment and I'll send you an audio message. [Audio] Hello. How can I help you today?' (tag [Audio] should be at the beginning)
    - **Default Setting**: By default, your messages will be [Text] unless the user has specifically requested that you respond with audio.
    - **Summarize Audios**: All audio messages should be as brief and concise as possible.
    - **Detailed Text**: You can provide more detailed responses in text messages.
    - If users need to reset any ongoing task or context, they should use the "-reset" command. This will cause you to not remember anything that was said previously to the command.
    ${botConfig.imageCreationEnabled?'- You can create images. If a user requests an image, guide them to use the command “-image <description>”. For example, respond with, “To create an image, please use the command \'-image a dancing dog\'.”':''}
    ${botConfig.imageCreationEnabled? '- Accuracy is key. If a command is misspelled, kindly notify the user of the mistake and suggest the correct command format. For instance, “It seems like there might be a typo in your command. Did you mean \'-image\' for generating images?”' : ''}
    ${prompt_info?`- Finally, consider this information: ${prompt_info}`:``}`;
}

// The exported configuration which combines both OpenAI and general bot configurations
export const CONFIG = {
  appName: 'Whatsapp-GPT-Bot', // The name of the application, used for logging and identification purposes
  botConfig,
  openAI,
  database,
  fakeyou,
  anthropic,
  buildPrompt
};
