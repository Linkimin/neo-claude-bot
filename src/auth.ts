export function isAllowed(userId: number | undefined, allowedUserId: number): boolean {
  return userId !== undefined && userId === allowedUserId
}
