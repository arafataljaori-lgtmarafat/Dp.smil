import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) throw new Error('Expected Expo public config JSON path.');
const config = JSON.parse(await readFile(path, 'utf8'));
const plugins = Array.isArray(config.plugins) ? config.plugins : [];
const secureStore = plugins.includes('expo-secure-store');
const imagePicker = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker');
const options = Array.isArray(imagePicker) ? imagePicker[1] : undefined;
if (
  config.scheme !== 'dentpilot'
  || !secureStore
  || !options
  || typeof options.photosPermission !== 'string'
  || typeof options.cameraPermission !== 'string'
  || options.microphonePermission !== false
) throw new Error('Phase 3C Expo configuration is incomplete.');
console.log('phase3c Expo configuration: PASS');
