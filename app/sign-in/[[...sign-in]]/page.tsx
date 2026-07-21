import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <div className="flex min-h-screen bg-base">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 border-r border-surface-border">
        <span className="text-2xl font-semibold text-copy-primary mb-2">Ghost AI</span>
        <p className="text-sm text-copy-secondary mb-8">
          Real-time collaborative system design workspace.
        </p>
        <ul className="space-y-2 text-sm text-copy-muted">
          <li>Design system architecture on a shared canvas</li>
          <li>AI-generated architecture from plain English</li>
          <li>Collaborate with teammates in real time</li>
          <li>Export your design as a Markdown spec</li>
        </ul>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <SignIn />
      </div>
    </div>
  )
}
