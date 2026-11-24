const knowledgeQuizDefinitions = {
  'article-21-right-to-life': {
    prompt: 'Which constitutional provision is the focus of this explainer?',
    choices: ['Article 14', 'Article 21', 'Article 51A'],
    answer: 1,
    explanation: 'Article 21 protects life and personal liberty, subject to procedure established by law.',
  },
  'article-14-equality': {
    prompt: 'Which pair of guarantees is associated with Article 14?',
    choices: [
      'Equality before the law and equal protection of the laws',
      'Freedom of religion and cultural rights',
      'Privacy and personal liberty',
    ],
    answer: 0,
    explanation: 'Article 14 guarantees equality before the law and equal protection of the laws.',
  },
  'fundamental-duties': {
    prompt: 'Where are the Fundamental Duties listed?',
    choices: ['Article 21', 'Part IX', 'Article 51A'],
    answer: 2,
    explanation: 'Article 51A in Part IVA sets out the Fundamental Duties.',
  },
  '73rd-amendment-panchayats': {
    prompt: 'Which part of the Constitution did the 73rd Amendment insert?',
    choices: ['Part III', 'Part IX', 'Part IVA'],
    answer: 1,
    explanation: 'The 73rd Amendment inserted Part IX, which provides the constitutional framework for Panchayats.',
  },
  'preamble-constitutional-theory': {
    prompt: 'Which set of values appears in the Preamble?',
    choices: [
      'Justice, liberty, equality, and fraternity',
      'Privacy, health, education, and property',
      'Revenue, defence, trade, and transport',
    ],
    answer: 0,
    explanation: 'The Preamble states commitments to justice, liberty, equality, and fraternity.',
  },
  'consumer-protection-research': {
    prompt: 'What is a useful first step when researching a consumer issue?',
    choices: [
      'Delete old messages',
      'Preserve bills and communications',
      'Assume every dispute has the same remedy',
    ],
    answer: 1,
    explanation: 'Preserving bills and communications helps establish the transaction and the issue.',
  },
  'right-to-information': {
    prompt: 'What does the RTI framework let citizens request?',
    choices: [
      'Information held by public authorities',
      'A court judgment before it is issued',
      'Private records held by any individual',
    ],
    answer: 0,
    explanation: 'The Act provides a process to request information held by public authorities, subject to its provisions and exemptions.',
  },
  'privacy-judgment-puttaswamy': {
    prompt: 'What did the 2017 Puttaswamy decision recognise?',
    choices: [
      'Privacy as a fundamental right',
      'A new part of the Constitution',
      'An automatic right to compensation in every case',
    ],
    answer: 0,
    explanation: 'The nine-judge bench unanimously recognised privacy as a fundamental right protected under Part III.',
  },
};

const assessmentTypes = ['practice', 'quiz', 'test'];

function makeQuestion(id, prompt, choices, correctChoiceId, explanation) {
  return {
    id,
    prompt,
    choices: choices.map(([choiceId, text]) => ({ id: choiceId, text })),
    correctChoiceId,
    explanation,
  };
}

const testDefinitions = {
  'article-21-right-to-life': [
    makeQuestion(
      'test-1',
      'What does Article 21 protect in its text?',
      [
        ['life-liberty', 'Life and personal liberty, subject to procedure established by law.'],
        ['citizens-only', 'Only the voting rights of citizens.'],
        ['property-only', 'Ownership of property in every circumstance.'],
      ],
      'life-liberty',
      'Article 21 states that no person shall be deprived of life or personal liberty except according to procedure established by law.',
    ),
    makeQuestion(
      'test-2',
      'In Maneka Gandhi, how did the Court describe a procedure affecting personal liberty?',
      [
        ['fair-just-reasonable', 'It must be fair, just, and reasonable.'],
        ['unreviewable', 'It cannot be reviewed by a court.'],
        ['always-identical', 'It must be identical in every case.'],
      ],
      'fair-just-reasonable',
      'The Court held that a procedure affecting personal liberty must be fair, just, and reasonable.',
    ),
    makeQuestion(
      'test-3',
      'Which interests have later decisions discussed in the context of Article 21?',
      [
        ['dignity-privacy-health', 'Dignity, privacy, and health.'],
        ['tax-only', 'Tax rates alone.'],
        ['elections-only', 'Election schedules alone.'],
      ],
      'dignity-privacy-health',
      'Later decisions have discussed dignity, privacy, health, and other interests in the context of Article 21.',
    ),
  ],
  'article-14-equality': [
    makeQuestion(
      'test-1',
      'Does equality always require identical treatment of every person or situation?',
      [
        ['no', 'No. The law may distinguish situations when the distinction meets the applicable legal test.'],
        ['yes', 'Yes. Any difference in treatment is automatically unconstitutional.'],
        ['unknown', 'No legal test can ever apply.'],
      ],
      'no',
      'Equality does not always require identical treatment; whether a distinction is lawful depends on the applicable test and facts.',
    ),
    makeQuestion(
      'test-2',
      'What connection does the reading say a classification should have?',
      [
        ['rational-purpose', 'A rational connection to a legitimate purpose.'],
        ['random', 'No connection to any purpose.'],
        ['personal-preference', 'Only the personal preference of the decision-maker.'],
      ],
      'rational-purpose',
      'The reading describes a rational connection to a legitimate purpose as relevant to a classification.',
    ),
    makeQuestion(
      'test-3',
      'What determines whether a particular classification is constitutional?',
      [
        ['facts-test', 'Its facts and the applicable legal test.'],
        ['label-only', 'The name given to the classification alone.'],
        ['nothing', 'It can never be assessed.'],
      ],
      'facts-test',
      'The facts and applicable legal test determine the assessment.',
    ),
  ],
  'fundamental-duties': [
    makeQuestion(
      'test-1',
      'Which duty is specifically mentioned in the reading?',
      [
        ['protect-environment', 'Protecting the natural environment.'],
        ['ignore-constitution', 'Ignoring the Constitution.'],
        ['private-property', 'Owning private property.'],
      ],
      'protect-environment',
      'Protecting and improving the natural environment is among the duties described in Article 51A.',
    ),
    makeQuestion(
      'test-2',
      'How many Fundamental Duties does the reading describe?',
      [
        ['eleven', 'Eleven.'],
        ['five', 'Five.'],
        ['twenty-one', 'Twenty-one.'],
      ],
      'eleven',
      'The reading describes eleven Fundamental Duties.',
    ),
    makeQuestion(
      'test-3',
      'What affects the legal effect of a Fundamental Duty?',
      [
        ['statute-context', 'The relevant statute and context.'],
        ['headline', 'The article headline alone.'],
        ['nothing', 'Nothing; every duty has the same automatic effect in every case.'],
      ],
      'statute-context',
      'The legal effect of a duty depends on the particular statute and context.',
    ),
  ],
  '73rd-amendment-panchayats': [
    makeQuestion(
      'test-1',
      'When did the 73rd Amendment come into force?',
      [
        ['1993-04-24', '24 April 1993.'],
        ['1992-01-26', '26 January 1992.'],
        ['2000-08-15', '15 August 2000.'],
      ],
      '1993-04-24',
      'The 73rd Amendment came into force on 24 April 1993.',
    ),
    makeQuestion(
      'test-2',
      'Which constitutional part did the 73rd Amendment insert?',
      [
        ['part-ix', 'Part IX.'],
        ['part-iii', 'Part III.'],
        ['part-iva', 'Part IVA.'],
      ],
      'part-ix',
      'The 73rd Amendment inserted Part IX, which concerns Panchayats.',
    ),
    makeQuestion(
      'test-3',
      'What also shapes the exact powers and responsibilities of Panchayats?',
      [
        ['state-law', 'State legislation.'],
        ['the Preamble alone', 'The Preamble alone.'],
        ['an individual reading list', 'An individual reader’s saved articles.'],
      ],
      'state-law',
      'The exact powers and responsibilities also depend on state legislation.',
    ),
  ],
  'preamble-constitutional-theory': [
    makeQuestion(
      'test-1',
      'Which set of commitments is named in the Preamble?',
      [
        ['justice-liberty-equality-fraternity', 'Justice, liberty, equality, and fraternity.'],
        ['tax-trade-defence-revenue', 'Tax, trade, defence, and revenue.'],
        ['privacy-property-health-education', 'Privacy, property, health, and education.'],
      ],
      'justice-liberty-equality-fraternity',
      'The Preamble states commitments to justice, liberty, equality, and fraternity.',
    ),
    makeQuestion(
      'test-2',
      'How should the Preamble be read in understanding the Constitution?',
      [
        ['alongside-operative-text', 'As an aid to understanding purpose, alongside the operative provisions.'],
        ['instead-of-text', 'Instead of the operative provisions.'],
        ['as-a-statute', 'As a standalone statute replacing the Constitution.'],
      ],
      'alongside-operative-text',
      'The Preamble is read alongside the operative provisions of the Constitution.',
    ),
    makeQuestion(
      'test-3',
      'Which case did the reading identify when discussing the Preamble and basic structure?',
      [
        ['kesavananda', 'Kesavananda Bharati v. State of Kerala (1973).'],
        ['maneka', 'Maneka Gandhi v. Union of India (1978).'],
        ['puttaswamy', 'Justice K.S. Puttaswamy v. Union of India (2017).'],
      ],
      'kesavananda',
      'The reading refers to Kesavananda Bharati v. State of Kerala (1973).',
    ),
  ],
  'consumer-protection-research': [
    makeQuestion(
      'test-1',
      'What should someone preserve when researching a consumer issue?',
      [
        ['records', 'Bills, receipts, and communications connected with the transaction.'],
        ['nothing', 'No records; they are never useful.'],
        ['only-advertisements', 'Only unrelated advertisements.'],
      ],
      'records',
      'Bills, receipts, and related communications can help establish the transaction and issue.',
    ),
    makeQuestion(
      'test-2',
      'What should be checked when identifying a relevant consumer forum?',
      [
        ['jurisdiction', 'The forum’s territorial and monetary jurisdiction.'],
        ['colour', 'The colour of the paperwork.'],
        ['headline', 'The headline of an unrelated article.'],
      ],
      'jurisdiction',
      'The relevant forum’s territorial and monetary jurisdiction should be verified.',
    ),
    makeQuestion(
      'test-3',
      'What can affect available remedies and limitation periods?',
      [
        ['facts-current-law', 'The circumstances and current law.'],
        ['summary-only', 'The summary alone, regardless of facts.'],
        ['nothing', 'They are always identical in every dispute.'],
      ],
      'facts-current-law',
      'Remedies and limitation periods depend on the circumstances and current law.',
    ),
  ],
  'right-to-information': [
    makeQuestion(
      'test-1',
      'What type of information can a citizen request under the RTI framework?',
      [
        ['public-authority', 'Information held by public authorities, subject to the Act.'],
        ['any-private-record', 'Any private record held by any individual.'],
        ['future-judgment', 'A court judgment before it is issued.'],
      ],
      'public-authority',
      'The Act covers information held by public authorities, subject to its provisions and exemptions.',
    ),
    makeQuestion(
      'test-2',
      'What helps make an RTI request clear?',
      [
        ['specific-record', 'Identify the public authority and ask for specific existing records.'],
        ['vague-demand', 'Ask a vague question without identifying the authority.'],
        ['personal-opinion', 'Request a private person’s opinion.'],
      ],
      'specific-record',
      'A useful request identifies the authority and asks for clear, existing records.',
    ),
    makeQuestion(
      'test-3',
      'What should a requester verify before applying?',
      [
        ['current-requirements', 'Current requirements, fees, exemptions, deadlines, and appeal routes.'],
        ['nothing', 'Nothing; the process never changes.'],
        ['unrelated-rules', 'Rules for an unrelated private service.'],
      ],
      'current-requirements',
      'Requirements and timelines should be checked against current law and the relevant authority’s guidance.',
    ),
  ],
  'privacy-judgment-puttaswamy': [
    makeQuestion(
      'test-1',
      'How many judges sat on the Puttaswamy bench discussed in the reading?',
      [
        ['nine', 'Nine judges.'],
        ['three', 'Three judges.'],
        ['one', 'One judge.'],
      ],
      'nine',
      'The reading describes a unanimous nine-judge bench.',
    ),
    makeQuestion(
      'test-2',
      'What did the 2017 decision recognise?',
      [
        ['privacy-right', 'Privacy as a fundamental right protected under Part III.'],
        ['new-part', 'A new part of the Constitution.'],
        ['automatic-compensation', 'Automatic compensation in every privacy-related case.'],
      ],
      'privacy-right',
      'The decision recognised privacy as a fundamental right protected under Part III.',
    ),
    makeQuestion(
      'test-3',
      'What affects how the judgment applies to a particular issue?',
      [
        ['later-law-facts', 'Later law and the specific facts.'],
        ['title-alone', 'The case title alone.'],
        ['nothing', 'Nothing; the result is automatic in every situation.'],
      ],
      'later-law-facts',
      'How the principles apply depends on later law and the facts.',
    ),
  ],
};

function buildAssessments(material) {
  const practice = {
    type: 'practice',
    title: 'Practice: apply the idea',
    introduction: 'Try a realistic next-step scenario before checking your understanding.',
    questions: [
      makeQuestion(
        'practice-1',
        `A friend reads “${material.title}” and thinks it settles their real legal problem. What is the best next step?`,
        [
          ['verify', 'Check the current legal source and compare the specific facts before drawing a conclusion.'],
          ['assume', 'Assume the summary applies to every situation that sounds similar.'],
          ['stop', 'Rely only on the short explainer and skip the cited source.'],
        ],
        'verify',
        'A plain-language explainer is a starting point. The current law and the facts determine how a rule may apply.',
      ),
    ],
  };

  const quizDefinition = knowledgeQuizDefinitions[material.slug];
  const quiz = quizDefinition
    ? {
      type: 'quiz',
      title: 'Quick quiz: recall the key point',
      introduction: 'Check the central idea from this reading.',
      questions: [
        makeQuestion(
          'quiz-1',
          quizDefinition.prompt,
          quizDefinition.choices.map((choice, index) => [`choice-${index}`, choice]),
          `choice-${quizDefinition.answer}`,
          quizDefinition.explanation,
        ),
      ],
    }
    : {
      type: 'quiz',
      title: 'Quick quiz: check the source',
      introduction: 'Check what this reading identifies as its legal source.',
      questions: [
        makeQuestion(
          'quiz-1',
          'What is the best way to verify a legal claim in this reading?',
          [
            ['primary-source', 'Check the cited primary legal source and its current status.'],
            ['headline', 'Rely only on a headline or short summary.'],
            ['assumption', 'Assume the claim applies without checking its context.'],
          ],
          'primary-source',
          'The cited primary source and its current status are the best starting points for verification.',
        ),
      ],
    };

  const test = {
    type: 'test',
    title: 'Final test: put it together',
    introduction: 'Answer all three questions to see your score and review each explanation.',
    questions: testDefinitions[material.slug] || [
      makeQuestion(
        'test-1',
        'Which source is listed with this reading?',
        [
          ['listed-source', material.source],
          ['social-post', 'An unnamed social-media post'],
          ['no-source', 'No legal source is identified'],
        ],
        'listed-source',
        'Use the source listed with the reading to verify the relevant legal text or authority.',
      ),
      makeQuestion(
        'test-2',
        'Before applying general legal information to a real situation, what should you check?',
        [
          ['facts-current-law', 'The specific facts and the current law that applies.'],
          ['summary-only', 'Only whether the summary sounds familiar.'],
          ['guaranteed-result', 'Whether the reading guarantees a particular outcome.'],
        ],
        'facts-current-law',
        'A legal outcome depends on the specific facts and the law in force; a general explainer cannot guarantee it.',
      ),
      makeQuestion(
        'test-3',
        'How should you use this learning material?',
        [
          ['starting-point', 'As an educational starting point, alongside the full source and relevant context.'],
          ['personal-advice', 'As personalised advice for every legal problem.'],
          ['final-answer', 'As a guaranteed final answer without further checking.'],
        ],
        'starting-point',
        'This material supports learning. Check the full source and seek qualified advice for a specific matter.',
      ),
    ],
  };

  return { practice, quiz, test };
}

function getPublicAssessments(material) {
  const assessments = buildAssessments(material);
  return Object.fromEntries(assessmentTypes.map((type) => {
    const assessment = assessments[type];
    return [type, {
      type: assessment.type,
      title: assessment.title,
      introduction: assessment.introduction,
      questions: assessment.questions.map(({ id, prompt, choices }) => ({ id, prompt, choices })),
    }];
  }));
}

function gradeAssessment(material, type, submittedAnswers) {
  const assessment = buildAssessments(material)[type];
  if (!assessment || !Array.isArray(submittedAnswers) || submittedAnswers.length !== assessment.questions.length) {
    return null;
  }

  const answersByQuestion = new Map();
  for (const answer of submittedAnswers) {
    if (!answer || typeof answer.questionId !== 'string' || typeof answer.choiceId !== 'string'
        || answersByQuestion.has(answer.questionId)) {
      return null;
    }
    answersByQuestion.set(answer.questionId, answer.choiceId);
  }

  const results = [];
  let score = 0;
  for (const question of assessment.questions) {
    const choiceId = answersByQuestion.get(question.id);
    if (!choiceId || !question.choices.some((choice) => choice.id === choiceId)) return null;
    const isCorrect = choiceId === question.correctChoiceId;
    if (isCorrect) score += 1;
    results.push({
      questionId: question.id,
      choiceId,
      isCorrect,
      correctChoiceId: question.correctChoiceId,
      explanation: question.explanation,
    });
  }
  if (answersByQuestion.size !== assessment.questions.length) return null;

  return {
    score,
    maxScore: assessment.questions.length,
    percentage: Math.round((score / assessment.questions.length) * 100),
    results,
  };
}

module.exports = { assessmentTypes, getPublicAssessments, gradeAssessment };
