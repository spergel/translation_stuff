import { NextRequest, NextResponse } from 'next/server'

// TODO: Migrate this API route to use Firestore instead of Prisma
// Temporarily disabled for Firebase migration

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'API route temporarily disabled during migration' }, { status: 503 })
} 