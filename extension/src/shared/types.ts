// User types
export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  tier: 'free' | 'pro' | 'creator';
  createdAt: string;
}

export interface UserPreferences {
  showDrawings: boolean;
  showAnnotations: boolean;
  showCourses: boolean;
  showFrom: 'all' | 'following' | 'none';
}

// Drawing types
export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  type: 'stroke';
  points: Point[];
  color: string;
  width: number;
  style: BrushStyle;
  opacity: number;
}

export interface TextItem {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  opacity: number;
  style: TextStyle;
}

export type DrawingItem = Stroke | TextItem;

export interface Drawing {
  id: string;
  userId: string;
  user?: User;
  pageUrl: string;
  items: DrawingItem[];
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

// Brush types
export type BrushStyle = 'solid' | 'spray' | 'dots' | 'square' | 'rainbow' | 'glow';
export type TextStyle = 'normal' | 'rainbow' | 'aged' | 'neon';
export type Visibility = 'public' | 'followers' | 'private';

// Annotation types
export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface Annotation {
  id: string;
  userId: string;
  user?: User;
  pageUrl: string;
  selector: TextQuoteSelector;
  cssHint?: string;
  body: string;
  visibility: Visibility;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  annotationId: string;
  userId: string;
  user?: User;
  parentId: string | null;
  body: string;
  createdAt: string;
}

// Game types
export interface CourseElement {
  x: number;
  y: number;
}

export interface Flag extends CourseElement {
  number: number;
}

export interface Course {
  id: string;
  userId: string;
  user?: User;
  pageUrl: string;
  start: CourseElement | null;
  flags: Flag[];
  finish: CourseElement | null;
  spikes: CourseElement[];
  boosts: CourseElement[];
  triples: CourseElement[];
  lowgs: CourseElement[];
  visibility: Visibility;
  createdAt: string;
}

export interface RaceTime {
  id: string;
  courseId: string;
  userId: string;
  user?: User;
  timeMs: number;
  character: string;
  createdAt: string;
}

// API types
export interface ApiError {
  error: string;
  message: string;
  upgradeRequired?: boolean;
  requiredTier?: string;
}

export interface PageContent {
  drawings: Drawing[];
  annotations: Annotation[];
  courses: Course[];
}

export interface FeedItem {
  type: 'drawing' | 'annotation' | 'course';
  item: Drawing | Annotation | Course;
  user: User;
  createdAt: string;
}
