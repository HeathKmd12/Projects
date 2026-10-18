const MAX_FILE_SIZE = 10 * 1024 * 1024
const allowedMimeTypes = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['pdf', 'application/pdf'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['mp4', 'video/mp4']
])

export function materialTypeFor(file) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'pdf'
  if (extension === 'docx') return 'document'
  if (extension === 'pptx') return 'presentation'
  if (extension === 'mp4') return 'video'
  return 'image'
}

export async function uploadMaterial(file) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!cloudName || !uploadPreset) throw Error('Cloudinary upload settings are not configured.')
  if (!allowedMimeTypes.has(extension) || file.type !== allowedMimeTypes.get(extension)) throw Error('The selected file type is not allowed or does not match its extension.')
  if (file.size > MAX_FILE_SIZE) throw Error('Files must be 10 MB or smaller.')

  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', uploadPreset)
  body.append('folder', 'smart-learning-assistant/materials')
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: 'POST', body })
  const data = await response.json()
  if (!response.ok) throw Error(data.error?.message || 'Cloudinary could not upload this file.')
  return { url: data.secure_url, cloudinaryPublicId: data.public_id, cloudinaryResourceType: data.resource_type, fileName: file.name, fileBytes: data.bytes || file.size, materialType: materialTypeFor(file) }
}

