# Beltranus Bot with GPT-3

This is a Beltranus Bot, a Whatsapp bot project that utilizes the GPT-3.5/4 language model from OpenAI to process and respond to messages. The bot is written in TypeScript and uses the `whatsapp-web.js` library to interact with the WhatsApp API.

## Features

- The bot can receive WhatsApp messages and process them using the GPT-3 model to generate responses.
- It can play custom audio files in OGG format.
- It uses the ElevenTTS service to generate audio from text.
- Stores chat configuration in a PostgreSQL database.

## Prerequisites

Before running this project, make sure you have the following installed:

- Node.js
- npm (Node.js package manager)
- PostgreSQL

## Configuration

Follow these steps to set up the project:

1. Clone this repository on your local machine.
2. Run `npm install` to install the project dependencies.
3. Create a `.env` file in the root of the project and add the following environment variables:


- DATABASE_URL=<PostgreSQL_database_URL> 
- OPENAI_API_KEY=<OpenAI_API_key> 
- ELEVEN_KEY=<ElevenTTS_API_key> 
- PSQL_USER=<PostgreSQL_username> 
- PSQL_PASS=<PostgreSQL_password> 
- PSQL_HOST=<PostgreSQL_host> 
- PSQL_DB=<PostgreSQL_database>


4. Configure the PostgreSQL database connection settings in the `database/postgresql.ts` file.
5. Configure the GPT-3.5 / GPT-4 language model and API key in the `chatgpt.ts` file.
6. Run `npm run build` to compile the TypeScript project to JavaScript.

## Usage

To start the bot, run `npm start`. This will initiate the WhatsApp client and display a QR code in the console. Scan the QR code with your phone to log in to WhatsApp.

Once the bot is up and running, it will be ready to receive and respond to WhatsApp messages using the GPT-3 model.

## Additional Files

### `database/postgresql.ts`

This file contains the implementation of the PostgreSQL client for storing and retrieving chat configurations. It establishes a connection to the PostgreSQL database and provides methods for executing queries.

### `eleven.ts`

This file contains the functions for generating audio using the ElevenTTS service. It includes enums for voice options and language models. The `elevenTTS` function sends a text message to ElevenTTS and returns the generated audio as a readable stream.

### `chatgpt.ts`

This file implements the `ChatGTP` class, which handles sending messages to the GPT-3 model using the OpenAI API. It creates chat completion requests with a list of messages and retrieves the response from the model.

## Contribution

If you wish to contribute to this project, feel free to do so. You can open issues or submit pull requests in this repository.

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).