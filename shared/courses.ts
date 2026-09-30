export const DEFAULT_COURSES = ["Entradas", "Principales", "Postres"] as const;

/** Trimmed, single-spaced name; null when empty or too long. */
export function cleanCourse(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name && name.length <= 60 ? name : null;
}

export function courseKey(name: string) { return name.toLocaleLowerCase("es"); }

/** Built-in courses first, then the kitchen's own, without case-insensitive duplicates. */
export function mergeCourses(custom: string[]): string[] {
  const seen = new Set<string>();
  return [...DEFAULT_COURSES, ...custom].filter((name) => {
    const key = courseKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type CourseSection<T> = { name: string | null; items: T[] };

/** One section per course in order, then recipes whose course is unset or unknown under name null. */
export function groupByCourse<T>(items: T[], courses: string[], courseOf: (item: T) => string | null | undefined): CourseSection<T>[] {
  const index = new Map(courses.map((name, position) => [courseKey(name), position]));
  const sections: CourseSection<T>[] = courses.map((name) => ({ name, items: [] }));
  const other: T[] = [];
  items.forEach((item) => {
    const course = courseOf(item);
    const position = course ? index.get(courseKey(course)) : undefined;
    if (position === undefined) other.push(item);
    else sections[position].items.push(item);
  });
  return other.length ? [...sections, { name: null, items: other }] : sections;
}
