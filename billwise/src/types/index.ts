export type UserRole = 'admin' | 'user'

export interface User {
  id: string
  name: string
  pin: string // hashed in DB, plain for local demo
  role: UserRole
  avatar?: string
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
