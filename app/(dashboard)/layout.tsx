import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
          <Link href="/imports" className="font-semibold">mlcrm</Link>
          <div className="flex gap-4 text-sm">
            <Link href="/imports" className="text-gray-700 hover:text-black">Imports</Link>
            <Link href="/jobs" className="text-gray-700 hover:text-black">Jobs</Link>
            <Link href="/companies" className="text-gray-700 hover:text-black">Companies</Link>
            <Link href="/keywords" className="text-gray-700 hover:text-black">Keywords</Link>
          </div>
          <div className="ml-auto text-xs text-gray-500">{user.email}</div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}