// Edge Runtime compatible encryption using Web Crypto API
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-secret-key-here' // Should be 32 characters
const IV_LENGTH = 16 // For AES, this is always 16

// Helper to convert string to Uint8Array
function stringToUint8Array(str) {
  const encoder = new TextEncoder()
  return encoder.encode(str)
}

// Helper to convert Uint8Array to string
function uint8ArrayToString(arr) {
  const decoder = new TextDecoder()
  return decoder.decode(arr)
}

// Helper to convert hex string to Uint8Array
function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

// Helper to convert Uint8Array to hex string
function uint8ArrayToHex(arr) {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Get encryption key as CryptoKey
async function getKey() {
  const keyString = ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)
  const keyData = stringToUint8Array(keyString)
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-CBC', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encrypt(text) {
  if (!text) return null

  try {
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Get encryption key
    const key = await getKey()

    // Encrypt the text
    const encodedText = stringToUint8Array(text)
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      key,
      encodedText
    )

    const encrypted = new Uint8Array(encryptedBuffer)

    // Return IV + encrypted data as hex string
    return uint8ArrayToHex(iv) + ':' + uint8ArrayToHex(encrypted)
  } catch (error) {
    console.error('Encryption error:', error)
    return null
  }
}

export async function decrypt(encryptedText) {
  if (!encryptedText) return null

  try {
    const textParts = encryptedText.split(':')
    const ivHex = textParts.shift()
    const encryptedHex = textParts.join(':')

    const iv = hexToUint8Array(ivHex)
    const encryptedData = hexToUint8Array(encryptedHex)

    // Get decryption key
    const key = await getKey()

    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      encryptedData
    )

    const decrypted = new Uint8Array(decryptedBuffer)
    return uint8ArrayToString(decrypted)
  } catch (error) {
    console.error('Decryption error:', error)
    return null
  }
}