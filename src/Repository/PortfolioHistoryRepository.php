<?php

namespace App\Repository;

use App\Entity\PortfolioHistory;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<PortfolioHistory>
 *
 * @method PortfolioHistory|null find($id, $lockMode = null, $lockVersion = null)
 * @method PortfolioHistory|null findOneBy(array $criteria, array $orderBy = null)
 * @method PortfolioHistory[]    findAll()
 * @method PortfolioHistory[]    findBy(array $criteria, array $orderBy = null, $limit = null, $offset = null)
 */
class PortfolioHistoryRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, PortfolioHistory::class);
    }

    /**
     * Compte le nombre de clients uniques ayant été dans le portefeuille 
     * du technicien pendant la période donnée (même partiellement).
     */
    public function countActivePortfolio(User $technician, \DateTimeInterface $start, \DateTimeInterface $end): int
    {
        try {
            $count = $this->createQueryBuilder('h')
                ->select('COUNT(DISTINCT h.customer)')
                ->where('h.technician = :tech')
                ->andWhere('h.startDate <= :end')
                ->andWhere('(h.endDate IS NULL OR h.endDate >= :start)')
                ->setParameter('tech', $technician)
                ->setParameter('start', $start)
                ->setParameter('end', $end)
                ->getQuery()
                ->getSingleScalarResult();

            // Sécurité : on force le typage en entier (au cas où le driver renvoie une string "0")
            return (int) $count;
            
        } catch (\Doctrine\ORM\NoResultException $e) {
            // Sécurité ultime : si jamais la requête ne renvoie rien
            return 0;
        } catch (\Exception $e) {
            // Optionnel : Logguer l'erreur ici si besoin
            return 0;
        }
    }
}