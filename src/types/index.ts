export type UserRole = 'admin' | 'user'

export interface Group {
  id: string
  name: string
  inviteCode: string   // short code used in the shareable join link
  ownerEmail: string   // email that registered the group
  createdAt: string
}

export interface User {
  id: string
  name: string
  pin: string // hashed in DB, plain for local demo
  role: UserRole
  avatar?: string
  groupId?: string | null // null = legacy shared space
  createdAt: string
}

export interface BillItem {
  id: string
  sessionId: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  category?: string
}

export type SessionStatus = 'active' | 'locked' | 'completed'

export interface Session {
  id: string
  orderId: string
  groupId?: string | null // null = legacy shared space
  restaurantName: string
  date: string
  billImageUrl?: string
  billImageBase64?: string
  status: SessionStatus
  isPublic: boolean          // admin controls user visibility
  subtotal: number
  cgst: number
  sgst: number
  totalAmount: number
  createdBy: string
  createdAt: string
  completedAt?: string | null // set when all participants lock in, null when reopened
  participantIds: string[]
  lockedParticipantIds: string[]
}

export interface ItemSelection {
  id: string
  sessionId: string
  userId: string
  itemId: string
  portionPercentage: number // 0-100
  lockedAt?: string
}

export interface UserBillSummary {
  userId: string
  userName: string
  itemBreakdown: {
    item: BillItem
    portionPercentage: number
    amount: number
  }[]
  itemsTotal: number
  cgstShare: number
  sgstShare: number
  additionalChargesShare: number
  grandTotal: number
  isLocked: boolean
}

export interface ParsedBill {
  restaurantName: string
  date: string
  items: Omit<BillItem, 'id' | 'sessionId'>[]
  subtotal: number
  cgst: number
  sgst: number
  totalAmount: number
  rawText?: string
}

export interface AppState {
  users: User[]
  sessions: Session[]
  billItems: Record<string, BillItem[]> // sessionId -> items
  selections: ItemSelection[]
}
