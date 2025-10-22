import { redirect } from 'next/navigation';

const letterToGame = (l: string) => (l === 'v' ? 'valorant' : l === 'b' ? 'bgmi' : undefined);

export default async function TeamInviteRedirect(props: { params: Promise<{ letter: string; code: string }> }) {
	const { letter, code } = await props.params;
	const game = letterToGame(letter);
	const qs = new URLSearchParams();
	if (code) qs.set('code', code);
	if (game) qs.set('game', game);
	redirect(`/ics25/my?${qs.toString()}`);
}
