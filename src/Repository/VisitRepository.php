<?php
namespace App\Repository;

use App\Entity\Visit;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class VisitRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Visit::class);
    }

    /**
     * Trouve les visites actives (non closes) créées il y a plus de 72h
     * @return Visit[]
     */
    public function findExpiredVisits(): array
    {
        // On calcule la date limite : "Maintenant moins 72 heures"
        $threshold = new \DateTime('-72 hours');

        return $this->createQueryBuilder('v')
            ->andWhere('v.closed = :isClosed')
            ->andWhere('v.activated = :isActivated')
            ->andWhere('v.visitedAt <= :threshold') // "Inférieur ou égal à la date limite"
            ->setParameter('isClosed', false)
            ->setParameter('isActivated', true)
            ->setParameter('threshold', $threshold)
            ->getQuery()
            ->getResult();
    }
}