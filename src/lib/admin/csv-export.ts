/**
 * Shared CSV export utility for admin endpoints.
 * Usage: check `format=csv` query param, then call toCsvResponse().
 */

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCsvResponse(
  rows: Record<string, unknown>[],
  filename: string
): Response {
  if (rows.length === 0) {
    return new Response('', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => escapeCsvField(String(row[h] ?? ''))).join(',')
    ),
  ]

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

export function isCsvRequest(request: Request): boolean {
  const url = new URL(request.url)
  return url.searchParams.get('format') === 'csv'
}
