import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { UserProvider } from "@/context/UserContext";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </UserProvider>
  );
}
