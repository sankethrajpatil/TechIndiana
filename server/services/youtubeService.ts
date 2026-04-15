import { google } from 'googleapis';

const youtube = google.youtube('v3');

export async function fetchVideosForSkills(missing_skills: string[]) {
  const apiKey = process.env.GOOGLE_API_KEY; // Reusing current key
  if (!apiKey) {
    console.warn('[YouTube Service] Missing GOOGLE_API_KEY. Returning empty video list.');
    return [];
  }

  const results = [];

  for (const skill of missing_skills) {
    try {
      console.log(`[YouTube Service] Searching for: ${skill} tutorial`);
      const response = await youtube.search.list({
        key: apiKey,
        part: ['snippet'],
        q: `${skill} tutorial`,
        type: ['video'],
        maxResults: 1, // Limiting to 1 to stay within quota for demo
      });

      const video = response.data.items?.[0];
      if (video && video.id?.videoId) {
        results.push({
          skill,
          title: video.snippet?.title || `${skill} Tutorial`,
          videoId: video.id.videoId,
          url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
          thumbnail: video.snippet?.thumbnails?.default?.url
        });
      }
    } catch (error) {
      console.error(`[YouTube Service] Error searching for ${skill}:`, error);
    }
  }

  return results;
}
