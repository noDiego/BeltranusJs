import getStream from 'get-stream';

export async function convertStreamToMessageMedia(audioStream) {
  // Convertir el flujo a un Buffer
  const audioBuffer = await getStream.buffer(audioStream);

  // Convertir el Buffer a una cadena Base64
  return audioBuffer.toString('base64');
}