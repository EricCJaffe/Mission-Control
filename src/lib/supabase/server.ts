import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const supabaseServer = async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // In server components, setting cookies is not allowed.
              // Route handlers will still succeed; server components will ignore.
            }
          })
        },
      },
    }
  )
}
