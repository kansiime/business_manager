import './globals.css';
import { ToastProvider } from '@/components/Toast';
import TenantProvider from '@/components/TenantProvider';
import WakingBanner from '@/components/WakingBanner';

export const metadata = { title: 'Business Manager' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TenantProvider>
          <ToastProvider>
            <WakingBanner />
            {children}
          </ToastProvider>
        </TenantProvider>
      </body>
    </html>
  );
}