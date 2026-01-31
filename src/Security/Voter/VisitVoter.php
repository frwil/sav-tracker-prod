<?php

namespace App\Security\Voter;

use App\Entity\Visit;
use App\Entity\User;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Vote;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

class VisitVoter extends Voter
{
    public const EDIT = 'VISIT_EDIT';
    public const CLOSE = 'VISIT_CLOSE';

    public function __construct(private Security $security) {}

    protected function supports(string $attribute, mixed $subject): bool
    {
        return in_array($attribute, [self::EDIT, self::CLOSE])
            && $subject instanceof Visit;
    }

    // 👇 C'EST ICI LA CORRECTION CRITIQUE (mixed + : bool)
    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token, ?Vote $vote = null): bool
    {
        $user = $token->getUser();
        if (!$user instanceof User) {
            return false;
        }

        /** @var Visit $visit */
        $visit = $subject;

        if ($this->security->isGranted('ROLE_ADMIN') || $this->security->isGranted('ROLE_SUPER_ADMIN')) {
            return true;
        }

        // Si la visite n'est pas activée (archivée), on refuse tout
        if (!$visit->isActivated()) {
            return false;
        }

        // Si la visite est fermée, on refuse tout
        if ($visit->isClosed()) {
            return false;
        }

        // Règle des 48h
        $now = new \DateTime();
        $interval = $now->diff($visit->getVisitedAt());
        if ($interval->days >= 2) {
            return false;
        }

        return true;
    }
}