import { ChatShell } from "@/components/chat-shell";
import { BenjiAuthProvider } from "@/components/benji-auth-provider";

export default function Home() {
  return (
    <BenjiAuthProvider>
      <ChatShell />
    </BenjiAuthProvider>
  );
}
