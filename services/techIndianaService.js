import { getDB } from '../db.js';

// Simple, minimal data access layer for TechIndiana collections
// All functions assume connectToDatabase() was called on startup.

async function getPersonas() {
  const db = getDB();
  return db.collection('personas_reference').find({}).toArray();
}

async function getPrograms() {
  const db = getDB();
  return db.collection('programs_reference').find({}).toArray();
}

async function getCareerTracks() {
  const db = getDB();
  return db.collection('career_tracks').find({}).toArray();
}

async function getEmployerArchetypes() {
  const db = getDB();
  return db.collection('employer_archetypes').find({}).toArray();
}

async function getJourneysByPersona(persona) {
  const db = getDB();
  return db.collection('main_user_journeys').find({ persona }).toArray();
}

async function getQuestionsByPersona(persona) {
  const db = getDB();
  return db.collection('question_bank').find({ persona }).toArray();
}

async function getDecisionRulesByPersona(persona) {
  const db = getDB();
  return db.collection('decision_rules').find({ persona }).toArray();
}

async function getConversationsByPersona(persona) {
  const db = getDB();
  return db.collection('conversation_scenarios').find({ persona }).toArray();
}

async function getNavigationByPersona(persona) {
  const db = getDB();
  return db.collection('navigation_logic').find({ persona }).toArray();
}

export {
  getPersonas,
  getPrograms,
  getCareerTracks,
  getEmployerArchetypes,
  getJourneysByPersona,
  getQuestionsByPersona,
  getDecisionRulesByPersona,
  getConversationsByPersona,
  getNavigationByPersona,
};
