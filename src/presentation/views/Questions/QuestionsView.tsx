import React from 'react';
import { useQuestionViewModel } from '../../viewmodels/useQuestionViewModel';
import { QuestionsHomeView } from './QuestionsHomeView';
import { GenerateQuestionsView } from './GenerateQuestionsView';
import { ProfessorProfilesView } from './ProfessorProfilesView';
import { QuestionPracticeView } from './QuestionPracticeView';

export const QuestionsView: React.FC = () => {
  const { currentStep, setCurrentStep } = useQuestionViewModel();

  switch (currentStep) {
    case 'generate':
      return (
        <GenerateQuestionsView
          onBack={() => setCurrentStep('home')}
          onQuestionsGenerated={() => setCurrentStep('practice')}
        />
      );

    case 'profiles':
      return <ProfessorProfilesView onBack={() => setCurrentStep('home')} />;

    case 'practice':
      return <QuestionPracticeView onBack={() => setCurrentStep('home')} />;

    case 'home':
    default:
      return (
        <QuestionsHomeView
          onNavigateToGenerate={() => setCurrentStep('generate')}
          onNavigateToProfiles={() => setCurrentStep('profiles')}
          onNavigateToPractice={() => setCurrentStep('practice')}
        />
      );
  }
};
