import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Brand, withAlpha } from './brand';
import { DeviceFrame } from './DeviceFrame';
import { UIMock } from './UIMock';
import { KineticHeadline, Eyebrow } from './KineticHeadline';
import { StatCard } from './StatCard';

export const GlmScene: React.FC<{brand: Brand}> = ({brand}) => {
	const {fps} = useVideoConfig();
	const frame = useCurrentFrame();

	// --- Continuous Ambient Motion ---
	// Subtle floating sine wave for the device (never stops)
	const floatY = Math.sin(frame / 35) * 20;
	const floatRot = Math.sin(frame / 50) * 2;

	// Slow camera push-in (Dolly effect)
	const cameraScale = interpolate(frame, [0, 150], [1, 1.06], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Background gradient rotation
	const bgRotation = interpolate(frame, [0, 150], [0, 20], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// --- Entry Animations ---
	// Device Spring Entry (Elastic pop)
	const deviceEntry = spring({
		frame,
		fps,
		config: {mass: 1, damping: 15, stiffness: 60},
	});

	// Text Stagger Helpers
	const textEntry = (startFrame: number) => {
		return spring({
			frame: frame - startFrame,
			fps,
			config: {damping: 12, stiffness: 80},
		});
	};

	const eyebrowOpacity = textEntry(10);
	const eyebrowY = interpolate(eyebrowOpacity, [0, 1], [20, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const statOpacity = textEntry(70);
	const statX = interpolate(statOpacity, [0, 1], [-30, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: brand.colors.bg,
				fontFamily: brand.fontSans,
				color: brand.colors.text,
				overflow: 'hidden',
			}}
		>
			{/* Dynamic Background Layer */}
			<AbsoluteFill
				style={{
					background: `radial-gradient(circle at 80% 40%, ${withAlpha(
						brand.colors.accent,
						0.12
					)}, transparent 65%)`,
					transform: `rotate(${bgRotation}deg) scale(1.4)`,
					opacity: 0.8,
				}}
			/>

			{/* Main Composition */}
			<div
				style={{
					display: 'flex',
					flexDirection: 'row',
					height: '100%',
					width: '100%',
					alignItems: 'center',
					padding: '0 6%', // Title safe padding
					boxSizing: 'border-box',
					position: 'relative',
					zIndex: 10,
				}}
			>
				{/* Left Column: Typography */}
				<div
					style={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
						maxWidth: 650,
						zIndex: 20,
					}}
				>
					{/* Eyebrow */}
					<div
						style={{
							opacity: eyebrowOpacity,
							transform: `translateY(${eyebrowY}px)`,
							marginBottom: 24,
						}}
					>
						<Eyebrow brand={brand} startAt={10}>
							Insturix
						</Eyebrow>
					</div>

					{/* Headline */}
					<div style={{marginBottom: 40}}>
						<KineticHeadline
							brand={brand}
							text="Your brand, everywhere."
							accentWord="everywhere"
							startAt={20}
							fontSize={96}
							maxWidth={650}
						/>
					</div>

					{/* Stat Card */}
					<div
						style={{
							opacity: statOpacity,
							transform: `translateX(${statX}px)`,
							display: 'inline-block',
						}}
					>
						<StatCard
							brand={brand}
							value={10}
							suffix="x"
							label="faster"
							startAt={70}
						/>
					</div>
				</div>

				{/* Right Column: Product Visualization */}
				<div
					style={{
						flex: 1.2,
						height: '100%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						position: 'relative',
						perspective: 1200,
					}}
				>
					{/* Ambient Glow Behind Device */}
					<div
						style={{
							position: 'absolute',
							width: 700,
							height: 500,
							background: `radial-gradient(circle, ${withAlpha(
								brand.colors.accent,
								0.25
							)}, transparent 70%)`,
							filter: 'blur(80px)',
							transform: `translateY(${floatY * 1.2}px)`,
							opacity: deviceEntry,
							zIndex: 5,
						}}
					/>

					{/* Device Container with Parallax & Camera Move */}
					<div
						style={{
							transform: `
								scale(${deviceEntry * cameraScale})
								translateY(${floatY}px)
								rotate(${floatRot}deg)
							`,
							transformOrigin: 'center center',
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							zIndex: 10,
						}}
					>
						<DeviceFrame
							brand={brand}
							label="Insturix Dashboard"
							style={{
								width: '100%',
								maxWidth: 1000,
								height: 'auto',
								aspectRatio: 16 / 10,
								boxShadow: `0 40px 100px -20px ${withAlpha(
									brand.colors.text,
									0.15
								)}`,
							}}
						>
							<UIMock brand={brand} activeNav={0} />
						</DeviceFrame>
					</div>
				</div>
			</div>
		</AbsoluteFill>
	);
};