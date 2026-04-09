import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trợ lý sửa lỗi tiếng Hàn — Xirian',
  description: 'Real-time Korean corrector by Xirian',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600&family=Noto+Sans+KR:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
