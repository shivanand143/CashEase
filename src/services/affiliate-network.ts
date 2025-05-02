/**
 * Represents an affiliate sale.
 */
export interface AffiliateSale {
  /**
   * The unique identifier of the sale.
   */
  saleId: string;
  /**
   * The user ID associated with the sale.
   */
  userId: string;
  /**
   * The store where the sale occurred.
   */
  store: string;
  /**
   * The sale amount.
   */
  amount: number;
  /**
   * The timestamp of the sale.
   */
  timestamp: number;
}

/**
 * Asynchronously retrieves affiliate sales data.
 * Ideally this would be filtered by time but for this stub it is not.
 *
 * @returns A promise that resolves to an array of AffiliateSale objects.
 */
export async function getAffiliateSales(): Promise<AffiliateSale[]> {
  // TODO: Implement this by calling an API.

  return [
    {
      saleId: '123',
      userId: 'user1',
      store: 'Example Store',
      amount: 100,
      timestamp: Date.now(),
    },
    {
      saleId: '456',
      userId: 'user2',
      store: 'Another Store',
      amount: 50,
      timestamp: Date.now(),
    },
  ];
}
