"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Github, ArrowRight } from "lucide-react";
import { SectionWrapper } from "@/components/explainer/section-wrapper";
import { DotNav } from "@/components/explainer/dot-nav";
import { HeroBoard } from "@/components/explainer/hero-board";
import { GameWalkthrough } from "@/components/explainer/game-walkthrough";
import { LLMPipeline } from "@/components/explainer/llm-pipeline";
import { MirroredPairs } from "@/components/explainer/mirrored-pairs";
import { RatingExplorer } from "@/components/explainer/rating-explorer";
import { BootstrapViz } from "@/components/explainer/bootstrap-viz";

const SECTIONS = [
  { id: "hero", label: "Intro" },
  { id: "game", label: "The Game" },
  { id: "llm", label: "LLM as Player" },
  { id: "fairness", label: "Fair Matchups" },
  { id: "ratings", label: "Ratings" },
  { id: "confidence", label: "Confidence" },
  { id: "footer", label: "Explore" },
];

export function HowItWorksClient() {
  const [activeSection, setActiveSection] = useState("hero");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { threshold: 0.3 }
    );

    const obs = observerRef.current;
    sectionRefs.current.forEach((el) => obs.observe(el));

    return () => obs.disconnect();
  }, []);

  const registerRef = (id: string) => (el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
      observerRef.current?.observe(el);
    }
  };

  return (
    <div className="relative min-h-screen">
      <DotNav sections={SECTIONS} activeId={activeSection} />

      {/* Section 1: Hero */}
      <SectionWrapper id="hero" ref={registerRef("hero")}>
        <div className="space-y-8 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Can AI Play{" "}
            <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
              Codenames
            </span>
            ?
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            We pit large language models against each other in the word association game Codenames,
            then rate them like chess players. Here&apos;s how the benchmark works.
          </p>
          <HeroBoard />
        </div>
      </SectionWrapper>

      {/* Section 2: The Game */}
      <SectionWrapper id="game" ref={registerRef("game")}>
        <div className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            How Codenames Works
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Codenames is a team word game with two roles. The <strong className="text-red-400">spymaster</strong> sees
            which words belong to their team and gives a one-word clue plus a number (e.g. &quot;OCEAN 2&quot;)
            indicating how many words relate to that clue. The <strong className="text-blue-400">operative</strong> sees
            only the words and must guess which ones the clue refers to.
          </p>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            The board has 25 cards: 9 for the starting team, 8 for the other, 7 neutral, and 1 assassin.
            Guess the assassin and you lose instantly. First team to reveal all their cards wins.
          </p>
          <GameWalkthrough />
        </div>
      </SectionWrapper>

      {/* Section 3: LLM as Player */}
      <SectionWrapper id="llm" ref={registerRef("llm")}>
        <div className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            Teaching AI the Rules
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Each LLM receives the current game state as a structured prompt and responds with a JSON action —
            a clue (word + number) for spymasters, or a guess for operatives. Invalid clues get retry
            feedback up to 3 times. Structured output is enforced via the{" "}
            <span className="font-mono text-xs text-primary">instructor</span> library.
          </p>
          <LLMPipeline />
        </div>
      </SectionWrapper>

      {/* Section 4: Fair Matchups */}
      <SectionWrapper id="fairness" ref={registerRef("fairness")}>
        <div className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            Ensuring Fairness
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Every matchup is played <strong className="text-foreground">twice on the same board</strong> with
            swapped team colors, eliminating first-move and color advantage. These two games form
            a <strong className="text-foreground">pair</strong> — the unit of competition. A model must win
            both games for a &quot;sweep&quot;; split results count as a tie.
          </p>
          <MirroredPairs />
        </div>
      </SectionWrapper>

      {/* Section 5: Rating System */}
      <SectionWrapper id="ratings" ref={registerRef("ratings")}>
        <div className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            From Wins to Rankings
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Ratings use the <strong className="text-foreground">Bradley-Terry model</strong> — a pairwise
            comparison system where each model has a hidden strength parameter. Win probability is
            proportional to relative strength. The <strong className="text-foreground">Davidson extension</strong> adds
            a tie parameter θ because 1-1 pair results are common. Ratings are expressed on the
            familiar Elo scale (center = 1500).
          </p>
          <p className="text-sm text-muted-foreground">
            Drag the sliders below to see how ratings and ties interact:
          </p>
          <RatingExplorer />
        </div>
      </SectionWrapper>

      {/* Section 6: Confidence Intervals */}
      <SectionWrapper id="confidence" ref={registerRef("confidence")}>
        <div className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            How Confident Are We?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            We resample game results <strong className="text-foreground">1,000 times</strong> with replacement
            (bootstrap), refit the rating model each time, and take the middle 95% as the confidence
            interval. Wider error bars mean less certainty — usually from fewer games or more volatile results.
          </p>
          <BootstrapViz />
        </div>
      </SectionWrapper>

      {/* Section 7: Footer / CTA */}
      <SectionWrapper id="footer" ref={registerRef("footer")}>
        <div className="space-y-8 text-center">
          {/* Gradient divider */}
          <div className="mx-auto h-px w-32 bg-gradient-to-r from-red-500 to-blue-500" />

          <p className="text-base sm:text-lg text-muted-foreground">
            That&apos;s the benchmark. Now go explore the results.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Explore the Results <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/thomasjmiller12/codenames-benchmark"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <Github className="h-4 w-4" /> GitHub
            </a>
          </div>
        </div>
      </SectionWrapper>
    </div>
  );
}
