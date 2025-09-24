export const runtime = 'edge';

export default function handler(req, res) {
  res.status(200).json({ success: true, message: 'minimal test' });
}