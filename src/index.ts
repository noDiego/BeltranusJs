import { Chat, Message } from 'whatsapp-web.js';
import { Beltranus } from './beltranus';
import { tienePrefix } from './utils';
import { Wenchotino } from './wenchotino';

const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const client = new Client();
const beltranus: Beltranus = new Beltranus();
const wencho: Wenchotino = new Wenchotino();
require('dotenv').config();

const prefixWenchotino = 'wenchotino';
const prefixBel = 'bel';

client.on('qr', qr => {
  qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', async (message: Message) => {
  beltranus.readMessage(message);
});

client.initialize();//827813