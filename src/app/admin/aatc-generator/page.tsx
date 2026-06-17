import AATCGenerator from "@/components/admin/AATCGenerator";

// Gate this route however your portal already gates /admin (middleware, auth check, etc.).
export default function Page() {
  return (
    <main style={{ padding: 24, background: "#000", minHeight: "100vh" }}>
      <AATCGenerator />
    </main>
  );
}
