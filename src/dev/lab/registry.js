import resultsActions from './proposals/results-actions.js';
import historyList from './proposals/history-list.js';

export const LAB_PROPOSALS = Object.freeze([resultsActions, historyList]);
export const getProposal = id => LAB_PROPOSALS.find(proposal => proposal.id === id) ?? LAB_PROPOSALS[0];
