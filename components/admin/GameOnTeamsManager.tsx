'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gamepad2, Users, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

type Game = 'valorant' | 'bgmi';

type Member = {
  id: string;
  name: string;
  email: string;
  paymentStatus: 'paid' | 'pending' | 'none';
};

type Team = {
  _id: string;
  teamName: string;
  code: string;
  game: Game;
  leader: Member;
  members: Member[];
  totalMembers: number;
  paidMembers: number;
  pendingMembers: number;
  paymentStatus: 'all-paid' | 'partial' | 'none';
  createdAt: string;
  listed: boolean;
};

type Summary = {
  totalTeams: number;
  byGame: {
    valorant: number;
    bgmi: number;
  };
  byPaymentStatus: {
    allPaid: number;
    partial: number;
    none: number;
  };
};

export default function GameOnTeamsManager() {
  const [selectedGame, setSelectedGame] = useState<Game | 'all'>('all');
  const [teams, setTeams] = useState<Team[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(10);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const loadTeams = async (game: Game | 'all') => {
    setLoading(true);
    try {
      const url = game === 'all' 
        ? '/api/ics25/admin/gameon-teams'
        : `/api/ics25/admin/gameon-teams?game=${game}`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.ok) {
        setTeams(data.teams || []);
        setSummary(data.summary || null);
      } else {
        console.error('Failed to load teams:', data.error);
      }
    } catch (error) {
      console.error('Error loading teams:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams(selectedGame);
    setDisplayLimit(10); // Reset display limit when game changes
    setExpandedTeam(null); // Collapse all teams
  }, [selectedGame]);

  const getPaymentStatusBadge = (status: 'all-paid' | 'partial' | 'none') => {
    if (status === 'all-paid') {
      return <Badge className="bg-green-500 hover:bg-green-600 text-white">All Paid</Badge>;
    }
    if (status === 'partial') {
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Partial Payment</Badge>;
    }
    return <Badge variant="outline" className="text-zinc-500">No Payment</Badge>;
  };

  const getMemberPaymentBadge = (status: 'paid' | 'pending' | 'none') => {
    if (status === 'paid') {
      return <Badge variant="outline" className="text-green-600 border-green-600">Paid</Badge>;
    }
    if (status === 'pending') {
      return <Badge variant="outline" className="text-orange-600 border-orange-600">Pending</Badge>;
    }
    return <Badge variant="outline" className="text-zinc-400">None</Badge>;
  };

  const displayedTeams = teams.slice(0, displayLimit);
  const hasMore = displayLimit < teams.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900 dark:border-zinc-100 mx-auto"></div>
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card 
            className="cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            onClick={() => setSelectedGame('all')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                All Teams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[32px] font-bold">{summary.totalTeams}</p>
              <p className="text-[11px] text-zinc-500 mt-1">Total teams registered</p>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer hover:border-red-400 dark:hover:border-red-600 transition-colors ${selectedGame === 'valorant' ? 'border-red-500 bg-red-50 dark:bg-red-950/20' : ''}`}
            onClick={() => setSelectedGame('valorant')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-red-500" />
                VALORANT Teams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[32px] font-bold">{summary.byGame.valorant}</p>
              <p className="text-[11px] text-zinc-500 mt-1">VALORANT teams</p>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer hover:border-orange-400 dark:hover:border-orange-600 transition-colors ${selectedGame === 'bgmi' ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : ''}`}
            onClick={() => setSelectedGame('bgmi')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-orange-500" />
                BGMI Teams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[32px] font-bold">{summary.byGame.bgmi}</p>
              <p className="text-[11px] text-zinc-500 mt-1">BGMI teams</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Teams List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {selectedGame === 'all' && 'All Teams'}
                {selectedGame === 'valorant' && 'VALORANT Teams'}
                {selectedGame === 'bgmi' && 'BGMI Teams'}
              </CardTitle>
              <CardDescription>
                {teams.length} team{teams.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <div className="text-center py-12">
              <Gamepad2 className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
              <p className="text-zinc-600 dark:text-zinc-400">No teams found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedTeams.map((team) => {
                const isExpanded = expandedTeam === team._id;
                
                return (
                  <Card key={team._id} className="border-zinc-200 dark:border-zinc-800">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-bold text-lg">{team.teamName}</h3>
                            <Badge variant="outline" className="uppercase text-[11px]">
                              {team.game}
                            </Badge>
                            {getPaymentStatusBadge(team.paymentStatus)}
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Team Code: <span className="font-mono font-medium">{team.code}</span>
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedTeam(isExpanded ? null : team._id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Quick Stats */}
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="w-4 h-4 text-zinc-400" />
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {team.totalMembers} member{team.totalMembers !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {team.paidMembers} paid
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-orange-500" />
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {team.pendingMembers} pending
                          </span>
                        </div>
                      </div>

                      {/* Expanded Member Details */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                          {/* Leader */}
                          <div>
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <Badge variant="secondary" className="text-[11px]">Leader</Badge>
                            </h4>
                            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{team.leader.name}</p>
                                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    {team.leader.email}
                                  </p>
                                </div>
                                {getMemberPaymentBadge(team.leader.paymentStatus)}
                              </div>
                            </div>
                          </div>

                          {/* Members */}
                          {team.members.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2">
                                Team Members ({team.members.length})
                              </h4>
                              <div className="space-y-2">
                                {team.members.map((member) => (
                                  <div 
                                    key={member.id}
                                    className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="font-medium">{member.name}</p>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                          {member.email}
                                        </p>
                                      </div>
                                      {getMemberPaymentBadge(member.paymentStatus)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Team Info */}
                          <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                            Created: {new Date(team.createdAt).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Load More Button */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDisplayLimit(prev => prev + 10)}
                  >
                    Load 10 More Teams
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
