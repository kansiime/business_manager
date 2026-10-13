import './globals.css';
import { ToastProvider } from '@/components/Toast';
import TenantProvider from '@/components/TenantProvider';

export const metadata = { title: 'Business Manager' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TenantProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </TenantProvider>
      </body>
    </html>
  );
}