export interface InterestTag {
  id:       string;
  label:    string;
  category: string;
  weight:   number;
}

export interface UserSettings {
  emailDigest:         boolean;
  digestFrequency:     'daily' | 'weekly';
  autoPodcastTopN:     number;
  showDifficulty:      boolean;
  preferredDifficulty: 'beginner' | 'intermediate' | 'advanced' | 'all';
}

export interface User {
  id:                  string;
  email:               string;
  name:                string | null;
  role:                string | null;
  freeTextInterests:   string[] | null;
  structuredInterests: InterestTag[] | null;
  settings:            UserSettings | null;
  createdAt:           Date;
}
