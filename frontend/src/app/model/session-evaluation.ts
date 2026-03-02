import { PersistentData } from "./persistant.model";

/**
 * Represents the configuration for session evaluations in a conference, 
 * including evaluation period, maximum value, and evaluator details.
 */
export interface EvaluationConfig extends PersistentData {
  /** Conference ID */
  conferenceId: string;
  evaluationBeginDate: string; // ISO 8601 format
  evaluationEndDate: string; // ISO 8601 format
  evaluationMaxValue: number;
  allowHeart: boolean;
  allowNoWay: boolean;
  allowNoEval: boolean;
  evaluators: SessionEvaluator[];
  levelDescriptions: string[]
}

/**
 * Represents the feedback information for a session, 
 * including the average evaluation and the number of votes.
 */
export interface SessionEvaluator {
  /** User ID of the evaluator */
  userId: string;
  /** Track IDs that the evaluator is excluded from evaluating */
  excludedTrackIds: string[];
  /** Session Type IDs that the evaluator is excluded from evaluating */
  excludedSessionTypeIds: string[];
} 

/**
 * Represents a session evaluation, including the conference ID, 
 * session ID, track ID, user ID of the evaluator, and the evaluation value.
 */
export interface SessionEvaluation extends PersistentData {
  /** Conference Id */
  conferenceId: string;
  /** Session Id */
  sessionId: string;
  /** Track Id of the session */
  trackId: string;
  /** User Id of the evaluator */
  userId: string;
  /** Evaluation based on the number of stars */
  evaluation: number;
}

/**
 * Represents a session comment, including the conference ID, 
 * session ID, track ID, user ID of the evaluator, and the comment
 */
export interface SessionComment extends PersistentData {
  /** Conference Id */
  conferenceId: string;
  /** Session Id */
  sessionId: string;
  /** Track Id of the session */
  trackId: string;
  /** User Id of the evaluator */
  userId: string;
  /** Evaluation based on the number of stars */
  comment: string;
}