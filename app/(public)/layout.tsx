import { ReactNode } from 'react';

import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer';

const PublicLayout = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <Navbar />

      <main className="min-h-screen flex flex-col">{children}</main>

      <Footer />
    </>
  );
};

export default PublicLayout;
