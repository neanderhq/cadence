import { AuthForm } from "../auth-form";

type Props = { searchParams: Promise<{ expired?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { expired } = await searchParams;
  return <AuthForm mode="login" expired={expired === "1"} />;
}
