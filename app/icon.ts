import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

// Image generation - simple SVG-based icon
export default function Icon() {
  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          fontSize: 24,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
        },
        children: 'Ag',
      },
    } as any,
    {
      ...size,
    }
  );
}
