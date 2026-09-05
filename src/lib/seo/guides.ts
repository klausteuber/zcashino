import type { BrandId } from '@/lib/brand/types'

export interface PlayerGuide {
  brand: 'cypher' | '21z'
  slug: string
  title: string
  description: string
  sections: { title: string; paragraphs: string[] }[]
  links: { href: string; label: string }[]
}

export const playerGuides: PlayerGuide[] = [
  {
    brand: 'cypher',
    slug: 'getting-started-with-zcash',
    title: 'Getting Started with Zcash at CypherJester',
    description: 'Learn how demo play, session recovery, ZEC deposits, and hand verification work before your first game at CypherJester.',
    sections: [
      { title: 'Try the table before funding a session', paragraphs: [
        'CypherJester offers blackjack and video poker in your browser. Start in demo mode to learn the controls and see how bets and payouts are displayed. Demo balances are for practice and cannot be withdrawn.',
        'Blackjack is a sequence of decisions against the dealer. Video poker gives you five cards, lets you choose which to hold, and replaces the rest once. Pick the game whose rules you understand before moving to real play.',
      ] },
      { title: 'Save your recovery key', paragraphs: [
        'You do not create an email-and-password account. Your play is attached to a session. Use the recovery controls to create a recovery key and store it privately before depositing.',
        'Treat the key as access to your session. Do not post it in a screenshot or share it with another person. A deposit address tells a wallet where to send funds; it does not replace a recovery key.',
      ] },
      { title: 'Read the deposit details before sending ZEC', paragraphs: [
        'Open the deposit panel for your current session and copy the address shown there. Check the asset, address, amount, and network in your wallet before confirming a transfer. Wait for the required confirmations and the credited balance before betting.',
        'If you use the swap flow, review the quote, fees, minimum amount, destination, and expiry before sending anything. Use the instructions attached to that quote. The Get Zcash page explains the available funding routes.',
      ] },
      { title: 'Understand the stake and the result', paragraphs: [
        'In blackjack, doubling or splitting commits an additional stake. In video poker, the base bet multiplied by the coin count is the total cost of a hand. Read the active paytable: different Jacks or Better schedules pay different amounts for a flush and full house.',
        'Set a spending limit before real play. A payout table describes what a winning hand returns; it does not predict when you will win. Use the responsible gambling resources if you need help setting boundaries.',
      ] },
      { title: 'Check a hand after the seed is revealed', paragraphs: [
        'Save the game ID from your hand history. In session mode, the secret server seed is revealed when you rotate the seed session. Until then, verification can show a pending reveal. Once revealed, use the verifier to check the commitment and reproduce the hand.',
        'Demo play uses mock blockchain commitments. It can demonstrate the verification process, but it is not evidence of a real Zcash transaction. For real play, review the commitment transaction as well as the reproduced game result.',
      ] },
    ],
    links: [{ href: '/get-zec', label: 'ZEC deposit and swap options' }, { href: '/video-poker', label: 'Explore video poker' }, { href: '/blackjack', label: 'Explore blackjack' }],
  },
  {
    brand: 'cypher',
    slug: 'video-poker-payouts',
    title: 'Zcash Video Poker: Paytables and Payouts',
    description: 'Understand Jacks or Better schedules, Deuces Wild, coin counts, and the difference between a video poker payout and profit.',
    sections: [
      { title: 'Read the active paytable', paragraphs: [
        'Jacks or Better uses a standard deck with no wild cards. Its lowest paying result is a pair of jacks, queens, kings, or aces. Deuces Wild lets each two substitute for another card; its lowest paying result is three of a kind.',
        'The table can use different Jacks or Better schedules. In a 9/6 schedule, a full house pays nine base-bet units per coin and a flush pays six. An 8/5 schedule pays eight and five; a 7/5 schedule pays seven and five. Check the schedule displayed in the game before dealing.',
      ] },
      { title: 'Base bet, coin count, and total stake', paragraphs: [
        'The total stake is the base bet multiplied by the selected coin count, from one to five. The paytable entry for that coin count is multiplied by the base bet to calculate the payout.',
        'For example, a 0.01 ZEC base bet with five coins costs 0.05 ZEC. On the 9/6 Jacks or Better schedule, a full house at five coins returns 45 base-bet units: 0.45 ZEC. Subtract the 0.05 ZEC stake to get a 0.40 ZEC profit for that hand.',
      ] },
      { title: 'What the 4,000 royal-flush payout means', paragraphs: [
        'A natural royal flush at five coins pays 4,000 times the base bet. It does not pay 4,000 times the total five-coin stake. With a 0.01 ZEC base bet, the payout is 40 ZEC against a 0.05 ZEC stake: 800 times the total stake.',
        'At one through four coins, the royal-flush entries are 250, 500, 750, and 1,000 base-bet units. The five-coin entry changes the payout relationship. This explains the table; it is not a reason to stake more than your chosen budget.',
      ] },
      { title: 'Deuces Wild has a different ranking', paragraphs: [
        'The implemented Deuces Wild schedule pays 200 base-bet units per coin for four deuces, 25 for a wild royal flush, and 15 for five of a kind. A natural royal flush contains no wild substitution and has its own row.',
        'Do not carry a Jacks or Better holding rule into Deuces Wild without checking it. A pair is a paying result only in the appropriate Jacks or Better category; it is not a paying final result in Deuces Wild.',
      ] },
      { title: 'Payouts, decisions, and verification', paragraphs: [
        'A quoted theoretical return depends on the exact schedule and holding strategy. It is a long-run model, not a promise about your session. The visible paytable is the reference for the payout on a particular result.',
        'After the server seed is revealed, the verification tool can reproduce the deal and draw. Checking the shuffle and checking the payout are related steps: a reproduced deck should also lead to the recorded final hand and the correct return under that game’s paytable.',
      ] },
    ],
    links: [{ href: '/video-poker', label: 'View the video poker table' }, { href: '/verify', label: 'Verify a video poker hand' }, { href: '/guides/getting-started-with-zcash', label: 'Get started with Zcash' }],
  },
  {
    brand: '21z',
    slug: 'blackjack-rules',
    title: '21z Blackjack Rules and Decision Guide',
    description: 'Learn blackjack hand values, dealer rules, doubling, splitting, surrender, and how to review your decisions at the 21z table.',
    sections: [
      { title: 'The objective and card values', paragraphs: [
        'Your aim is to finish closer to 21 than the dealer without going over. Number cards count at face value, face cards count as ten, and an ace counts as one or eleven. A soft hand contains an ace still counted as eleven; a hard hand does not.',
        'For example, ace-six is soft 17. Drawing a ten changes it to hard 17 because the ace can count as one. Ten-seven is already hard 17; another ten would bust it. That distinction matters when choosing an action.',
      ] },
      { title: 'Dealer play and blackjack', paragraphs: [
        'Under the default table rules, the dealer draws below 17 and stands on 17, including soft 17. A natural blackjack is an ace with a ten-value card on the initial deal. The default blackjack payout is 3:2; check the active table rules before playing. A three-card total of 21 is not the same result as a natural blackjack.',
        'A basic-strategy reference should match the table’s actual rules, including dealer behavior, splitting, doubling, and surrender. A strategy chart for a different ruleset can recommend a different action. This guide explains the controls; it is not a complete optimal-strategy chart.',
      ] },
      { title: 'Hit, stand, or double', paragraphs: [
        'Hit takes another card. Stand keeps your total and ends that hand’s decisions. Double adds a stake equal to the current bet, deals one more card, and ends that hand’s turn. It requires an eligible two-card hand and enough available balance.',
        'With a 0.01 ZEC opening bet, doubling commits another 0.01 ZEC for a total stake of 0.02 ZEC. Check the dealer’s upcard as well as your own total before deciding. A larger stake changes the amount at risk, not the information available about the next card.',
      ] },
      { title: 'Splitting and surrender', paragraphs: [
        'When split is available, a pair becomes two separately staked hands. The game supports up to four hands and prevents re-splitting aces. You need sufficient balance for the additional bet. Follow the available action buttons for the current hand.',
        'Surrender is available only when enabled by the table rules, on the initial two-card unsplit, undoubled hand. It ends the hand and returns half the stake. Insurance is a separate wager when offered; it is not protection against every losing outcome.',
      ] },
      { title: 'Review decisions separately from luck', paragraphs: [
        'One winning hand does not establish that a decision was sound, and one loss does not prove the shuffle was unfair. Use demo play to learn the controls, record the exact rules when studying strategy, and set a stake limit before real play.',
        'For a check of the recorded hand, save the game ID and wait for the seed reveal after rotation. The verification tool can reproduce the hand from its committed inputs. The companion verification guide explains what each check establishes.',
      ] },
    ],
    links: [{ href: '/blackjack', label: 'Open the 21z blackjack table' }, { href: '/guides/verify-blackjack-hand', label: 'Verify a blackjack hand' }, { href: '/get-zec', label: 'Read ZEC funding instructions' }],
  },
  {
    brand: '21z',
    slug: 'verify-blackjack-hand',
    title: 'How to Verify a Blackjack Hand on 21z',
    description: 'Follow a blackjack hand from seed commitment to reveal and replay. Learn what pending reveal means and what verification can establish.',
    sections: [
      { title: 'Start with the game ID', paragraphs: [
        'Open your hand history or the verified hands feed and select the hand you want to inspect. Keep its game ID. The verifier supports a game-ID lookup and manual inputs; select Blackjack as the game type.',
        'A game ID identifies one recorded hand. A seed session can cover multiple hands, so the commitment transaction alone is not enough to distinguish your hand from the other hands in that session.',
      ] },
      { title: 'Understand the commitment and the nonce', paragraphs: [
        'Before real betting begins, the house anchors a hash of the secret server seed to Zcash. Your client seed and the hand nonce are used with that server seed to derive the deck. The nonce distinguishes hands that share the same seed session.',
        'You can set a custom client seed before the first hand of the active seed session. After play begins, rotate to a new seed session to set another client seed. Keep the recorded inputs and fairness version together: changing an input means you are checking a different shuffle.',
      ] },
      { title: 'Wait for reveal, then verify', paragraphs: [
        'In session mode, finishing a hand does not reveal the secret seed. Finish any active game and use the seed-rotation control. Rotation reveals the previous session’s server seed so its completed hands can be checked.',
        'If the verifier reports pending reveal, return after rotation and run the check again. Pending reveal is not a successful verification or a failed commitment check. Legacy hands use a different reveal lifecycle and can reveal at hand completion.',
      ] },
      { title: 'Read the checks in order', paragraphs: [
        'First, check that the revealed server seed hashes to the recorded commitment. Next, inspect the blockchain commitment result for real play. Finally, compare the reproduced cards, actions, outcome, and payout with the recorded hand.',
        'For example, two hands from one session may share a server-seed hash and client seed but have different nonces. Verify each game ID separately. Reusing the first hand’s nonce for the second hand does not reproduce the second hand’s deck.',
      ] },
      { title: 'Know the limits of the result', paragraphs: [
        'A successful replay demonstrates consistency between the recorded inputs, the deterministic game logic, and the recorded result. It does not establish a profitable strategy, guarantee future results, or prove the operator can meet every withdrawal.',
        'Demo hands use mock blockchain commitments. Use them to understand the process, but do not interpret a demo result as proof of a transaction on Zcash mainnet. If a real hand fails a check, preserve the game ID and the displayed result so the discrepancy can be investigated.',
      ] },
    ],
    links: [{ href: '/verify', label: 'Open the hand verifier' }, { href: '/feed', label: 'Browse recorded hands' }, { href: '/provably-fair', label: 'Read the fairness specification' }],
  },
]

export function getPlayerGuides(brandId: BrandId) {
  return playerGuides.filter(guide => guide.brand === brandId)
}

export function getPlayerGuide(brandId: BrandId, slug: string) {
  return getPlayerGuides(brandId).find(guide => guide.slug === slug)
}
