/** Only a structured wallet rejection proves that submission did not succeed. */
export class RpcRejectedError extends Error {
  constructor(public readonly code: number, message: string) {
    super(`RPC error ${code}: ${message}`)
    this.name = 'RpcRejectedError'
  }
}
