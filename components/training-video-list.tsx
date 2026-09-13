import { ArrowUpRight, Play, Trophy } from "lucide-react";
import Image from "next/image";

import type { TrainingVideo } from "@/lib/training-videos";

type TrainingVideoListProps = {
  videos: TrainingVideo[];
  compact?: boolean;
  preloadFirst?: boolean;
  title?: string;
  description?: string;
};

export function TrainingVideoList({ videos, compact = false, preloadFirst = false, title, description }: TrainingVideoListProps) {
  return (
    <section className={`training-video-list${compact ? " compact" : ""}`}>
      {title ? (
        <div className="training-list-heading">
          <div><Trophy /><h2>{title}</h2></div>
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      <div className="training-video-grid">
        {videos.map((video, index) => (
          <article className="training-video-card" key={video.videoId}>
            <a className="training-thumbnail" href={video.url} target="_blank" rel="noreferrer" aria-label={`${video.title}をYouTubeで見る`}>
              <Image
                src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
                alt=""
                fill
                unoptimized
                loading={preloadFirst && index === 0 ? "eager" : "lazy"}
                sizes={compact ? "(max-width: 760px) 100vw, 320px" : "(max-width: 760px) 100vw, 560px"}
              />
              <span><Play fill="currentColor" /></span>
            </a>
            <div className="training-video-copy">
              <div className="training-video-meta">
                <strong>#{compact ? index + 1 : video.rank}</strong>
                <span>{video.level}</span>
                <small>{video.creator}</small>
              </div>
              <h3>{video.title}</h3>
              <p>{video.summary}</p>
              <div className="training-skills">{video.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
              <a className="training-watch" href={video.url} target="_blank" rel="noreferrer">YouTubeで見る <ArrowUpRight /></a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
