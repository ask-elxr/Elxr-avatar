import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Gamepad2, 
  Brain, 
  Heart, 
  Lightbulb,
  MessageCircle,
  Star,
  Trophy,
  Loader2,
  ArrowLeft,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AvatarMiniGamesProps {
  avatarId: string;
  avatarName?: string;
  userId: string;
  onClose: () => void;
  onGameMessage?: (userMessage: string, avatarResponse: string) => void;
}

type GameType = 'menu' | 'trivia' | 'word-association' | 'mood-checkin' | 'would-you-rather' | 'story-builder';

interface TriviaQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface GameState {
  score: number;
  round: number;
  maxRounds: number;
}

const GAME_DESCRIPTIONS = {
  trivia: {
    title: "Trivia Challenge",
    description: "Test your knowledge with questions from your avatar's expertise",
    icon: Brain,
    color: "text-purple-400"
  },
  'word-association': {
    title: "Word Association",
    description: "Say the first thing that comes to mind",
    icon: Lightbulb,
    color: "text-yellow-400"
  },
  'mood-checkin': {
    title: "Mood Check-in",
    description: "A guided reflection on how you're feeling",
    icon: Heart,
    color: "text-pink-400"
  },
  'would-you-rather': {
    title: "Would You Rather",
    description: "Make tough choices and see what your avatar thinks",
    icon: MessageCircle,
    color: "text-cyan-400"
  },
  'story-builder': {
    title: "Story Builder",
    description: "Create a story together, one line at a time",
    icon: Sparkles,
    color: "text-orange-400"
  }
};

export function AvatarMiniGames({ avatarId, avatarName, userId, onClose, onGameMessage }: AvatarMiniGamesProps) {
  const { toast } = useToast();
  const [currentGame, setCurrentGame] = useState<GameType>('menu');
  const [isLoading, setIsLoading] = useState(false);
  const [gameState, setGameState] = useState<GameState>({ score: 0, round: 1, maxRounds: 5 });
  
  const [triviaQuestion, setTriviaQuestion] = useState<TriviaQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  
  const [wordPrompt, setWordPrompt] = useState<string>("");
  const [userWord, setUserWord] = useState<string>("");
  const [wordResponse, setWordResponse] = useState<string>("");
  
  const [moodQuestion, setMoodQuestion] = useState<string>("");
  const [moodResponse, setMoodResponse] = useState<string>("");
  const [moodInput, setMoodInput] = useState<string>("");
  
  const [wyrQuestion, setWyrQuestion] = useState<{ optionA: string; optionB: string } | null>(null);
  const [wyrChoice, setWyrChoice] = useState<'A' | 'B' | null>(null);
  const [wyrResponse, setWyrResponse] = useState<string>("");
  
  const [storyLines, setStoryLines] = useState<{ role: 'user' | 'avatar'; text: string }[]>([]);
  const [storyInput, setStoryInput] = useState<string>("");

  const displayName = avatarName || avatarId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const callGameAPI = useCallback(async (gameType: string, action: string, data?: any) => {
    const response = await fetch('/api/games/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avatarId,
        userId,
        gameType,
        action,
        data
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Game action failed');
    }
    
    return response.json();
  }, [avatarId, userId]);

  const startTrivia = useCallback(async () => {
    setIsLoading(true);
    setGameState({ score: 0, round: 1, maxRounds: 5 });
    setSelectedAnswer(null);
    setShowExplanation(false);
    
    try {
      const result = await callGameAPI('trivia', 'generate_question', { round: 1 });
      setTriviaQuestion(result.question);
      setCurrentGame('trivia');
    } catch (error) {
      toast({
        title: "Failed to start trivia",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [callGameAPI, toast]);

  const answerTrivia = useCallback(async (answerIndex: number) => {
    if (!triviaQuestion || selectedAnswer !== null) return;
    
    setSelectedAnswer(answerIndex);
    const isCorrect = answerIndex === triviaQuestion.correctIndex;
    
    if (isCorrect) {
      setGameState(prev => ({ ...prev, score: prev.score + 1 }));
    }
    
    setShowExplanation(true);
    
    if (onGameMessage) {
      onGameMessage(
        `[Trivia] I chose: ${triviaQuestion.options[answerIndex]}`,
        isCorrect 
          ? `Correct! ${triviaQuestion.explanation}` 
          : `Not quite. The answer was ${triviaQuestion.options[triviaQuestion.correctIndex]}. ${triviaQuestion.explanation}`
      );
    }
  }, [triviaQuestion, selectedAnswer, onGameMessage]);

  const nextTriviaQuestion = useCallback(async () => {
    if (gameState.round >= gameState.maxRounds) {
      toast({
        title: "Game Complete!",
        description: `You scored ${gameState.score}/${gameState.maxRounds}! Great job!`,
      });
      setCurrentGame('menu');
      return;
    }
    
    setIsLoading(true);
    setSelectedAnswer(null);
    setShowExplanation(false);
    
    try {
      const newRound = gameState.round + 1;
      const result = await callGameAPI('trivia', 'generate_question', { round: newRound });
      setTriviaQuestion(result.question);
      setGameState(prev => ({ ...prev, round: newRound }));
    } catch (error) {
      toast({
        title: "Failed to load next question",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [gameState, callGameAPI, toast]);

  const startWordAssociation = useCallback(async () => {
    setIsLoading(true);
    setGameState({ score: 0, round: 1, maxRounds: 10 });
    setUserWord("");
    setWordResponse("");
    
    try {
      const result = await callGameAPI('word-association', 'generate_prompt', { round: 1 });
      setWordPrompt(result.word);
      setCurrentGame('word-association');
    } catch (error) {
      toast({
        title: "Failed to start game",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [callGameAPI, toast]);

  const submitWord = useCallback(async () => {
    if (!userWord.trim()) return;
    
    setIsLoading(true);
    
    try {
      const result = await callGameAPI('word-association', 'respond', { 
        prompt: wordPrompt, 
        userWord: userWord.trim(),
        round: gameState.round 
      });
      
      setWordResponse(result.response);
      setGameState(prev => ({ ...prev, score: prev.score + 1 }));
      
      if (onGameMessage) {
        onGameMessage(
          `[Word Association] ${wordPrompt} -> ${userWord}`,
          result.response
        );
      }
      
      setTimeout(async () => {
        if (gameState.round >= gameState.maxRounds) {
          toast({
            title: "Great game!",
            description: `We made ${gameState.round} word connections!`,
          });
          setCurrentGame('menu');
        } else {
          setUserWord("");
          setWordResponse("");
          const newRound = gameState.round + 1;
          const nextResult = await callGameAPI('word-association', 'generate_prompt', { round: newRound });
          setWordPrompt(nextResult.word);
          setGameState(prev => ({ ...prev, round: newRound }));
        }
      }, 2000);
      
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [userWord, wordPrompt, gameState, callGameAPI, toast, onGameMessage]);

  const startMoodCheckin = useCallback(async () => {
    setIsLoading(true);
    setMoodInput("");
    setMoodResponse("");
    
    try {
      const result = await callGameAPI('mood-checkin', 'start', {});
      setMoodQuestion(result.question);
      setCurrentGame('mood-checkin');
    } catch (error) {
      toast({
        title: "Failed to start check-in",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [callGameAPI, toast]);

  const submitMoodResponse = useCallback(async () => {
    if (!moodInput.trim()) return;
    
    setIsLoading(true);
    
    try {
      const result = await callGameAPI('mood-checkin', 'respond', { 
        question: moodQuestion,
        userResponse: moodInput.trim() 
      });
      
      setMoodResponse(result.response);
      
      if (onGameMessage) {
        onGameMessage(moodInput, result.response);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [moodInput, moodQuestion, callGameAPI, toast, onGameMessage]);

  const startWouldYouRather = useCallback(async () => {
    setIsLoading(true);
    setWyrChoice(null);
    setWyrResponse("");
    
    try {
      const result = await callGameAPI('would-you-rather', 'generate', {});
      setWyrQuestion(result.question);
      setCurrentGame('would-you-rather');
    } catch (error) {
      toast({
        title: "Failed to start game",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [callGameAPI, toast]);

  const chooseWYR = useCallback(async (choice: 'A' | 'B') => {
    if (!wyrQuestion || wyrChoice) return;
    
    setWyrChoice(choice);
    setIsLoading(true);
    
    try {
      const result = await callGameAPI('would-you-rather', 'respond', { 
        optionA: wyrQuestion.optionA,
        optionB: wyrQuestion.optionB,
        userChoice: choice 
      });
      
      setWyrResponse(result.response);
      
      if (onGameMessage) {
        const chosen = choice === 'A' ? wyrQuestion.optionA : wyrQuestion.optionB;
        onGameMessage(`[Would You Rather] I'd rather: ${chosen}`, result.response);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [wyrQuestion, wyrChoice, callGameAPI, toast, onGameMessage]);

  const nextWYR = useCallback(async () => {
    setIsLoading(true);
    setWyrChoice(null);
    setWyrResponse("");
    
    try {
      const result = await callGameAPI('would-you-rather', 'generate', {});
      setWyrQuestion(result.question);
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [callGameAPI, toast]);

  const startStoryBuilder = useCallback(async () => {
    setIsLoading(true);
    setStoryLines([]);
    setStoryInput("");
    
    try {
      const result = await callGameAPI('story-builder', 'start', {});
      setStoryLines([{ role: 'avatar', text: result.opening }]);
      setCurrentGame('story-builder');
    } catch (error) {
      toast({
        title: "Failed to start story",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [callGameAPI, toast]);

  const continueStory = useCallback(async () => {
    if (!storyInput.trim()) return;
    
    const userLine = storyInput.trim();
    setStoryLines(prev => [...prev, { role: 'user', text: userLine }]);
    setStoryInput("");
    setIsLoading(true);
    
    try {
      const result = await callGameAPI('story-builder', 'continue', { 
        story: [...storyLines, { role: 'user', text: userLine }],
        userLine 
      });
      
      setStoryLines(prev => [...prev, { role: 'avatar', text: result.continuation }]);
      
      if (onGameMessage) {
        onGameMessage(`[Story] ${userLine}`, result.continuation);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [storyInput, storyLines, callGameAPI, toast, onGameMessage]);

  const backToMenu = useCallback(() => {
    setCurrentGame('menu');
    setTriviaQuestion(null);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setWordPrompt("");
    setWordResponse("");
    setMoodQuestion("");
    setMoodResponse("");
    setWyrQuestion(null);
    setWyrResponse("");
    setStoryLines([]);
  }, []);

  if (currentGame === 'menu') {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-strong border-white/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl text-white flex items-center gap-2">
                <Gamepad2 className="w-6 h-6 text-purple-400" />
                Play with {displayName}
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClose}
                className="text-white/60 hover:text-white"
                data-testid="games-close-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
            <CardDescription className="text-white/60">
              Choose a fun activity to do together
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(GAME_DESCRIPTIONS).map(([key, game]) => {
              const Icon = game.icon;
              return (
                <Button
                  key={key}
                  onClick={() => {
                    if (key === 'trivia') startTrivia();
                    else if (key === 'word-association') startWordAssociation();
                    else if (key === 'mood-checkin') startMoodCheckin();
                    else if (key === 'would-you-rather') startWouldYouRather();
                    else if (key === 'story-builder') startStoryBuilder();
                  }}
                  disabled={isLoading}
                  className="w-full justify-start gap-3 h-auto py-3 bg-white/5 hover:bg-white/10 border border-white/10"
                  variant="ghost"
                  data-testid={`game-btn-${key}`}
                >
                  <Icon className={`w-5 h-5 ${game.color}`} />
                  <div className="text-left">
                    <div className="text-white font-medium">{game.title}</div>
                    <div className="text-white/50 text-xs">{game.description}</div>
                  </div>
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentGame === 'trivia') {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-strong border-purple-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-400" />
                Trivia Challenge
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={backToMenu} className="text-white/60">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Progress value={(gameState.round / gameState.maxRounds) * 100} className="h-2 flex-1" />
              <Badge variant="secondary">{gameState.round}/{gameState.maxRounds}</Badge>
              <Badge className="bg-yellow-500/20 text-yellow-400 gap-1">
                <Star className="w-3 h-3" />
                {gameState.score}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : triviaQuestion ? (
              <>
                <p className="text-white text-lg">{triviaQuestion.question}</p>
                
                <div className="space-y-2">
                  {triviaQuestion.options.map((option, index) => (
                    <Button
                      key={index}
                      onClick={() => answerTrivia(index)}
                      disabled={selectedAnswer !== null}
                      className={`w-full justify-start text-left h-auto py-3 ${
                        selectedAnswer === null
                          ? 'bg-white/5 hover:bg-white/10 border border-white/10'
                          : index === triviaQuestion.correctIndex
                            ? 'bg-green-500/20 border border-green-500/40 text-green-300'
                            : selectedAnswer === index
                              ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                              : 'bg-white/5 border border-white/10 opacity-50'
                      }`}
                      variant="ghost"
                      data-testid={`trivia-option-${index}`}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
                
                {showExplanation && (
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-white/80 text-sm">{triviaQuestion.explanation}</p>
                  </div>
                )}
                
                {showExplanation && (
                  <Button
                    onClick={nextTriviaQuestion}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    data-testid="trivia-next-btn"
                  >
                    {gameState.round >= gameState.maxRounds ? 'Finish' : 'Next Question'}
                  </Button>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentGame === 'word-association') {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-strong border-yellow-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-400" />
                Word Association
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={backToMenu} className="text-white/60">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
            <Badge variant="secondary" className="w-fit">Round {gameState.round}/{gameState.maxRounds}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-6">
              <p className="text-white/60 text-sm mb-2">What comes to mind?</p>
              <p className="text-3xl font-bold text-yellow-400">{wordPrompt}</p>
            </div>
            
            {wordResponse ? (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-white/80">{wordResponse}</p>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={userWord}
                  onChange={(e) => setUserWord(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && submitWord()}
                  placeholder="Type your word..."
                  className="bg-black/30 border-white/20"
                  disabled={isLoading}
                  data-testid="word-input"
                />
                <Button
                  onClick={submitWord}
                  disabled={!userWord.trim() || isLoading}
                  className="bg-yellow-600 hover:bg-yellow-700"
                  data-testid="word-submit-btn"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentGame === 'mood-checkin') {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-strong border-pink-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-400" />
                Mood Check-in
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={backToMenu} className="text-white/60">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-pink-500/10 border border-pink-500/30">
              <p className="text-white">{moodQuestion}</p>
            </div>
            
            {moodResponse ? (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <p className="text-white/80">{moodResponse}</p>
              </div>
            ) : (
              <>
                <Input
                  value={moodInput}
                  onChange={(e) => setMoodInput(e.target.value)}
                  placeholder="Share how you're feeling..."
                  className="bg-black/30 border-white/20"
                  disabled={isLoading}
                  data-testid="mood-input"
                />
                <Button
                  onClick={submitMoodResponse}
                  disabled={!moodInput.trim() || isLoading}
                  className="w-full bg-pink-600 hover:bg-pink-700"
                  data-testid="mood-submit-btn"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Share'}
                </Button>
              </>
            )}
            
            {moodResponse && (
              <Button
                onClick={backToMenu}
                variant="outline"
                className="w-full"
                data-testid="mood-done-btn"
              >
                Done
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentGame === 'would-you-rather') {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-strong border-cyan-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-cyan-400" />
                Would You Rather
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={backToMenu} className="text-white/60">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && !wyrQuestion ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : wyrQuestion ? (
              <>
                <p className="text-white/60 text-center text-sm">Would you rather...</p>
                
                <div className="grid gap-3">
                  <Button
                    onClick={() => chooseWYR('A')}
                    disabled={wyrChoice !== null || isLoading}
                    className={`h-auto py-4 text-left ${
                      wyrChoice === 'A' 
                        ? 'bg-cyan-500/30 border-cyan-500/60' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                    variant="ghost"
                    data-testid="wyr-option-a"
                  >
                    <span className="text-cyan-400 font-bold mr-2">A:</span>
                    {wyrQuestion.optionA}
                  </Button>
                  
                  <div className="text-center text-white/40 text-sm">OR</div>
                  
                  <Button
                    onClick={() => chooseWYR('B')}
                    disabled={wyrChoice !== null || isLoading}
                    className={`h-auto py-4 text-left ${
                      wyrChoice === 'B' 
                        ? 'bg-cyan-500/30 border-cyan-500/60' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                    variant="ghost"
                    data-testid="wyr-option-b"
                  >
                    <span className="text-cyan-400 font-bold mr-2">B:</span>
                    {wyrQuestion.optionB}
                  </Button>
                </div>
                
                {wyrResponse && (
                  <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                    <p className="text-white/80">{wyrResponse}</p>
                  </div>
                )}
                
                {wyrChoice && (
                  <Button
                    onClick={nextWYR}
                    disabled={isLoading}
                    className="w-full bg-cyan-600 hover:bg-cyan-700"
                    data-testid="wyr-next-btn"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Another One'}
                    <RefreshCw className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentGame === 'story-builder') {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-strong border-orange-500/30 max-h-[80vh] flex flex-col">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-400" />
                Story Builder
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={backToMenu} className="text-white/60">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
            <CardDescription className="text-white/50">
              Build a story together, one line at a time
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
              {storyLines.map((line, index) => (
                <div 
                  key={index} 
                  className={`p-2 rounded-lg ${
                    line.role === 'avatar' 
                      ? 'bg-orange-500/10 border border-orange-500/20' 
                      : 'bg-white/5 border border-white/10'
                  }`}
                >
                  <p className="text-white/80 text-sm">{line.text}</p>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2 flex-shrink-0">
              <Input
                value={storyInput}
                onChange={(e) => setStoryInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && continueStory()}
                placeholder="Add to the story..."
                className="bg-black/30 border-white/20"
                disabled={isLoading}
                data-testid="story-input"
              />
              <Button
                onClick={continueStory}
                disabled={!storyInput.trim() || isLoading}
                className="bg-orange-600 hover:bg-orange-700"
                data-testid="story-submit-btn"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
