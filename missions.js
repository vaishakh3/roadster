// A visible, persistent three-cup progression for each authored venue.
// Daily and friend challenges keep their own objectives and never advance this.
export const CUPS = Object.freeze([
  {
    name: "BRONZE CUP",
    title: "FINISH ON THE PODIUM",
    short: "FINISH TOP 3",
    detail: "Beat at least one rival. Cross the finish in the top three.",
    place: 3,
  },
  {
    name: "SILVER CUP",
    title: "TAKE FIRST PLACE",
    short: "WIN THE RACE",
    detail: "Beat all three rivals. Use boost and their slipstream to pass.",
    place: 1,
  },
  {
    name: "GOLD CUP",
    title: "WIN WITHOUT DAMAGE",
    short: "CLEAN VICTORY",
    detail: "Finish first with all three condition bars intact.",
    place: 1,
    clean: true,
  },
]);
export function cupsEarned(career, courseId) {
  const value = career?.[courseId];
  return Number.isInteger(value) ? Math.min(3, Math.max(0, value)) : 0;
}
export function nextMission(career, courseId) {
  const earned = cupsEarned(career, courseId);
  return {
    ...CUPS[Math.min(2, earned)],
    level: Math.min(2, earned),
    earned,
    mastered: earned === 3,
  };
}
export function missionPassed(mission, run) {
  return (
    !!run.finished &&
    !run.failed &&
    (run.finishPosition || run.position || 4) <= mission.place &&
    (!mission.clean || run.hull === 3)
  );
}
export function awardMission(career, courseId, mission, run) {
  const earned = cupsEarned(career, courseId);
  if (!missionPassed(mission, run) || earned !== mission.level || earned >= 3)
    return { career, awarded: false };
  return { career: { ...career, [courseId]: earned + 1 }, awarded: true };
}
export function missionStatus(mission, run) {
  const place = run.finishPosition || run.position || 4;
  if (mission.clean && run.hull < 3)
    return { good: false, text: "DAMAGE TAKEN · RETRY FOR GOLD" };
  if (place <= mission.place)
    return {
      good: true,
      text: mission.clean
        ? "KEEP FIRST · KEEP IT CLEAN"
        : "HOLD YOUR POSITION TO THE FINISH",
    };
  return {
    good: false,
    text: `PASS ${place - mission.place} ${place - mission.place === 1 ? "RIVAL" : "RIVALS"} TO REACH YOUR TARGET`,
  };
}
